import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatService } from '../chat.service';
import { UserService } from '../../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface UserPresence {
  userId: number;
  status: 'online' | 'offline';
  lastSeen?: Date;
}

interface AuthenticatedSocket extends Socket {
  data: {
    user: {
      id: number;
      email: string;
      name?: string;
      role: string;
    };
  };
}

const CHAT_NAMESPACE = '/chat';
const CHAT_ROOM_PREFIX = 'chat_';

const EVENTS = {
  USER_PRESENCE: 'userPresence',
  CHAT_UPDATED: 'chatUpdated',
  MESSAGES_READ: 'messagesRead',
  NEW_MESSAGE: 'newMessage',
  LATEST_MESSAGE: 'latestMessage',
  CHAT_NOTIFICATION: 'chatNotification',
};

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: CHAT_NAMESPACE,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private userSockets = new Map<number, Set<string>>();
  private userPresence = new Map<number, UserPresence>();

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  public async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractTokenFromHeader(client.handshake);
      if (!token) throw new WsException('Unauthorized: No token provided');

      let payload;
      try {
        payload = await this.jwtService.verify(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        });
      } catch (err) {
        this.logger.warn('Invalid token provided');
        throw new WsException('Unauthorized: Invalid token');
      }

      const user = await this.userService.findById(payload.id);
      if (!user) throw new WsException('Unauthorized: User not found');

      client.data = {
        ...(client.data || {}),
        user: {
          id: user.id,
          email: user.email,
          name: user.name || 'User',
          role: user.role,
        },
      };

      const userId = client.data.user.id;
      this.addSocketForUser(userId, client.id);

      const currentPresence = this.userPresence.get(userId);
      const wasOffline =
        !currentPresence || currentPresence.status === 'offline';
      this.userPresence.set(userId, {
        userId,
        status: 'online',
        lastSeen: new Date(),
      });

      if (wasOffline) this.broadcastPresenceChange(userId, 'online');
      this.logger.log(`User ${userId} connected with socket ${client.id}`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`, error.stack);
      client.disconnect(true);
    }
  }

  public async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const userId = client.data?.user?.id;
    if (!userId) return;

    this.removeSocketForUser(userId, client.id);
    if (!this.userSockets.has(userId)) await this.updateUserOffline(userId);
    this.logger.log(`User ${userId} disconnected (${client.id})`);
  }

  @SubscribeMessage('joinChat')
  public async handleJoinChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() chatId: number,
  ): Promise<void> {
    try {
      await client.join(this.getChatRoomName(chatId));
      this.logger.log(`User ${client.data.user.id} joined chat ${chatId}`);
    } catch (error) {
      this.logger.error('Error joining chat:', error);
    }
  }

  @SubscribeMessage('joinUserChannel')
  public handleJoinUserChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { userId: number },
  ): void {
    const room = `user_${data.userId}`;
    client.join(room);
    this.logger.log(`User ${client.data.user.id} joined user channel ${room}`);
  }

  @SubscribeMessage('leaveUserChannel')
  public handleLeaveUserChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { userId: number },
  ): void {
    const room = `user_${data.userId}`;
    client.leave(room);
    this.logger.log(`User ${client.data.user.id} left user channel ${room}`);
  }

  @SubscribeMessage('markAsRead')
  public async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: number },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userId = client.data.user.id;
      await this.chatService.markMessagesAsRead(data.chatId, userId);

      this.server.to(`user_${userId}`).emit(EVENTS.MESSAGES_READ, {
        chatId: data.chatId,
        unreadCount: 0,
      });
      return { success: true };
    } catch (error) {
      this.logger.error('Error marking messages as read:', error);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('getUserStatus')
  public async handleGetUserStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() userId: number,
  ): Promise<UserPresence & { userId: number }> {
    const presence: UserPresence = this.userPresence.get(userId) || {
      userId,
      status: 'offline',
      lastSeen: undefined,
    };
    return presence;
  }

  @SubscribeMessage('getOnlineUsers')
  public async handleGetOnlineUsers(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ onlineUsers: { user_id: number; last_seen?: string }[] }> {
    const onlineUsers = Array.from(this.userPresence.values())
      .filter((presence) => presence.status === 'online')
      .map((presence) => ({
        user_id: presence.userId,
        last_seen: presence.lastSeen?.toISOString(),
      }));

    return { onlineUsers };
  }

  private extractTokenFromHeader(handshake: any): string | undefined {
    try {
      const authHeader = handshake?.headers?.authorization;
      if (authHeader?.startsWith('Bearer ')) return authHeader.split(' ')[1];
      return handshake?.auth?.token;
    } catch (error) {
      this.logger.error('Error extracting token:', error);
      return undefined;
    }
  }

  private addSocketForUser(userId: number, socketId: string): void {
    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
    this.userSockets.get(userId)?.add(socketId);
  }

  private removeSocketForUser(userId: number, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;
    sockets.delete(socketId);
    if (sockets.size === 0) this.userSockets.delete(userId);
  }

  private async updateUserOffline(userId: number): Promise<void> {
    const presence = this.userPresence.get(userId);
    if (presence?.status === 'online') {
      this.userPresence.set(userId, {
        userId,
        status: 'offline',
        lastSeen: new Date(),
      });
      this.broadcastPresenceChange(userId, 'offline');
    }
  }

  private broadcastPresenceChange(
    userId: number,
    status: 'online' | 'offline',
  ): void {
    this.server.emit(EVENTS.USER_PRESENCE, {
      userId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  private getChatRoomName(chatId: number): string {
    return `${CHAT_ROOM_PREFIX}${chatId}`;
  }

  public getServer(): Server {
    return this.server;
  }

  public emitNewMessage(chatId: number, message: any): void {
    this.server
      .to(this.getChatRoomName(chatId))
      .emit(EVENTS.NEW_MESSAGE, message);
  }

  public emitMessageDeleted(chatId: number, messageId: number): void {
    this.server
      .to(this.getChatRoomName(chatId))
      .emit('messageDeleted', { message_id: messageId });
  }

  public emitMessageUpdated(chatId: number, message: any): void {
    this.server
      .to(this.getChatRoomName(chatId))
      .emit('messageUpdated', message);
  }

  public emitLatestMessageToUser(userId: number, message: any): void {
    this.server.to(`user_${userId}`).emit(EVENTS.LATEST_MESSAGE, message);
  }
}
