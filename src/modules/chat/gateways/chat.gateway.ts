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

interface ChatUpdateData {
  chatId: number;
  lastMessage: string;
  lastMessageAt: Date;
  unreadCount: number;
  senderId: number;
}

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
  CHAT_NOTIFICATION: 'chatNotification',
  USER_TYPING: 'userTyping',
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

  // Track connected users and their socket IDs
  private userSockets = new Map<number, Set<string>>();

  // Track user presence
  private userPresence = new Map<number, UserPresence>();

  constructor(
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Handle new client connection
   */
  public async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token = this.extractTokenFromHeader(client.handshake);
      if (!token) {
        this.logger.warn('No authentication token provided');
        throw new WsException('Unauthorized: No token provided');
      }

      const payload = await this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (!payload?.id) {
        throw new WsException('Unauthorized: Invalid token payload');
      }

      const user = await this.userService.findById(payload.id);
      if (!user) {
        this.logger.warn(`User not found for ID: ${payload.id}`);
        throw new WsException('Unauthorized: User not found');
      }

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

      // Emit socketRegistered event to the connected client
      client.emit('socketRegistered', {
        success: true,
        message: 'Socket registered and authenticated',
        user: {
          id: user.id,
          email: user.email,
          name: user.name || 'User',
          role: user.role,
        },
      });

      const currentPresence = this.userPresence.get(userId);
      const wasOffline =
        !currentPresence || currentPresence.status === 'offline';

      this.userPresence.set(userId, {
        userId,
        status: 'online',
        lastSeen: new Date(),
      });

      if (wasOffline) {
        this.broadcastPresenceChange(userId, 'online');
      }

      this.logger.log(`User ${userId} connected with socket ${client.id}`);
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.disconnect(true);
    }
  }

  /**
   * Handle client disconnect
   */
  public async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const userId = client.data?.user?.id;
    if (!userId) return;

    this.removeSocketForUser(userId, client.id);

    // If no more sockets for this user, update presence
    if (!this.userSockets.has(userId)) {
      await this.updateUserOffline(userId);
    }

    this.logger.log(`User ${userId} disconnected (${client.id})`);
  }

  /**
   * Join a chat room
   */
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

  /**
   * Handle sending a message
   */
  @SubscribeMessage('sendMessage')
  public async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: number; message: string; type: string },
  ): Promise<{ success: boolean; message?: any; error?: string }> {
    try {
      const { user } = client.data;
      const { chatId, ...message } = data;

      // Emit to users in the chat room
      this.server.to(this.getChatRoomName(chatId)).emit(EVENTS.NEW_MESSAGE, {
        message,
      });

      await this.notifyChatUpdate(chatId, user.id, message);

      return { success: true, message };
    } catch (error) {
      this.logger.error('Error sending message:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle typing indicator
   */
  @SubscribeMessage('typing')
  public handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: number; isTyping: boolean },
  ): void {
    const userId = client.data.user.id;
    client.to(this.getChatRoomName(data.chatId)).emit(EVENTS.USER_TYPING, {
      userId,
      isTyping: data.isTyping,
    });
  }

  /**
   * Mark messages as read
   */
  @SubscribeMessage('markAsRead')
  public async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: number },
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const userId = client.data.user.id;
      await this.chatService.markMessagesAsRead(data.chatId, userId);

      const updateData = {
        chatId: data.chatId,
        unreadCount: 0,
        lastReadAt: new Date(),
      };

      this.emitToUserSockets(userId, EVENTS.MESSAGES_READ, updateData);

      return { success: true };
    } catch (error) {
      this.logger.error('Error marking messages as read:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user status (online/offline)
   */
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

  /**
   * Get list of online users
   */
  @SubscribeMessage('getOnlineUsers')
  public async handleGetOnlineUsers(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<{ onlineUsers: { userId: number; lastSeen?: string }[] }> {
    const onlineUsers = Array.from(this.userPresence.values())
      .filter((presence) => presence.status === 'online')
      .map((presence) => ({
        userId: presence.userId,
        lastSeen: presence.lastSeen?.toISOString(),
      }));

    return { onlineUsers };
  }

  /**
   * Extract token from handshake headers or query
   */
  private extractTokenFromHeader(handshake: any): string | undefined {
    try {
      const authHeader = handshake?.headers?.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
      }
      return handshake?.auth?.token || handshake?.query?.token;
    } catch (error) {
      this.logger.error('Error extracting token:', error);
      return undefined;
    }
  }

  /**
   * Add socket id to the user's socket set
   */
  private addSocketForUser(userId: number, socketId: string): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(socketId);
  }

  /**
   * Remove socket id from the user's socket set
   */
  private removeSocketForUser(userId: number, socketId: string): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.userSockets.delete(userId);
    }
  }

  /**
   * Convert a userId to their connected socket IDs array
   */
  private getSocketIds(userId: number): string[] {
    return Array.from(this.userSockets.get(userId) ?? []);
  }

  /**
   * Emit an event to all connected sockets of a user
   */
  private emitToUserSockets(userId: number, event: string, payload: any): void {
    const socketIds = this.getSocketIds(userId);
    socketIds.forEach((socketId) => {
      this.server.to(socketId).emit(event, payload);
    });
  }

  /**
   * Update user presence to offline
   */
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

  /**
   * Broadcast presence change to all users
   */
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

  /**
   * Get chat room name for socket.io rooms
   */
  private getChatRoomName(chatId: number): string {
    return `${CHAT_ROOM_PREFIX}${chatId}`;
  }

  /**
   * Notify chat update to sender and recipient
   */
  private async notifyChatUpdate(
    chatId: number,
    userId: number,
    message: any,
  ): Promise<void> {
    try {
      const chat = await this.chatService.getRawChat(chatId);
      if (!chat) {
        this.logger.error(
          `[notifyChatUpdate] Chat not found for chatId: ${chatId}`,
        );
        return;
      }

      const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;

      const unreadCount = await this.chatService.getUnreadCount(
        chatId,
        otherUserId,
      );

      const updateData: ChatUpdateData = {
        chatId,
        lastMessage: message.message,
        lastMessageAt: new Date(),
        unreadCount,
        senderId: userId,
      };

      this.emitToUserSockets(otherUserId, EVENTS.CHAT_UPDATED, updateData);

      this.emitToUserSockets(userId, EVENTS.CHAT_UPDATED, {
        ...updateData,
        unreadCount: 0, // Sender has read the message they just sent
      });
    } catch (error) {
      this.logger.error(
        `Error notifying chat update: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Expose server instance
   */
  public getServer(): Server {
    return this.server;
  }
}
