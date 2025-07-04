import {
  SubscribeMessage,
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger, Inject, forwardRef } from '@nestjs/common';
import { WsJwtAuthGuard } from '../../../common/guards/ws-jwt-auth.guard';
import { ChatService } from '../chat.service';
import { UserService } from '../../user/user.service';

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
      userId: number;
      email: string;
      name?: string;
      role: string;
    };
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URLS?.split(',') || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/chat',
})
@UseGuards(WsJwtAuthGuard)
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
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
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const { user } = client.data;
      if (!user?.userId) {
        throw new Error('Invalid user data');
      }

      // Add socket to user's socket set
      if (!this.userSockets.has(user.userId)) {
        this.userSockets.set(user.userId, new Set());
      }
      this.userSockets.get(user.userId)?.add(client.id);

      // Update user presence
      const currentPresence = this.userPresence.get(user.userId);
      const wasOffline =
        !currentPresence || currentPresence.status === 'offline';

      this.userPresence.set(user.userId, {
        userId: user.userId,
        status: 'online',
        lastSeen: new Date(),
      });

      // Notify others if user just came online
      if (wasOffline) {
        this.broadcastPresenceChange(user.userId, 'online');
      }

      this.logger.log(`User ${user.userId} connected with socket ${client.id}`);
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const { user } = client.data;
    if (!user?.userId) return;

    // Remove socket from user's socket set
    const userSockets = this.userSockets.get(user.userId);
    if (userSockets) {
      userSockets.delete(client.id);

      // If no more sockets for this user, mark as offline
      if (userSockets.size === 0) {
        this.userSockets.delete(user.userId);
        await this.updateUserOffline(user.userId);
      }
    }

    this.logger.log(`User ${user.userId} disconnected (${client.id})`);
  }

  @SubscribeMessage('joinChat')
  async handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() chatId: number,
  ) {
    try {
      const user = client.data.user;
      await client.join(`chat_${chatId}`);
      console.log(`User ${user.userId} joined chat ${chatId}`);
    } catch (error) {
      console.error('Error joining chat:', error);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: number; message: string; type: string },
  ) {
    try {
      const { user } = client.data;
      const { chatId, message, type } = data;

      // Save message to database
      const savedMessage = await this.chatService.sendMessage(
        user.userId,
        chatId,
        { message, messageType: type as any },
      );

      // Broadcast to all clients in the chat room
      this.server.to(`chat_${chatId}`).emit('newMessage', {
        ...savedMessage,
        sender: { id: user.userId, name: user.name || 'User' },
      });

      // Notify about chat update (for sidebar)
      await this.notifyChatUpdate(chatId, user.userId, savedMessage);

      // Notify the other participant if they're online
      const chat = await this.chatService.getChatDetails(chatId);
      const otherUserId =
        chat.user1Id === user.userId ? chat.user2Id : chat.user1Id;
      const otherUserSockets = this.userSockets.get(otherUserId);

      if (otherUserSockets && otherUserSockets.size > 0) {
        // Convert Set to array for socket.io
        const socketIds = Array.from(otherUserSockets);
        socketIds.forEach((socketId) => {
          this.server.to(socketId).emit('chatNotification', {
            chatId,
            message: savedMessage,
            sender: { id: user.userId, name: user.name || 'User' },
          });
        });
      }

      return { success: true, message: savedMessage };
    } catch (error) {
      console.error('Error sending message:', error);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { chatId: number; isTyping: boolean },
  ) {
    const user = client.data.user;
    client.to(`chat_${data.chatId}`).emit('userTyping', {
      userId: user.userId,
      isTyping: data.isTyping,
    });
  }

  private async updateUserOffline(userId: number) {
    const currentPresence = this.userPresence.get(userId);
    const wasOnline = currentPresence?.status === 'online';

    if (wasOnline) {
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
  ) {
    // Notify all users who have a chat with this user
    this.server.emit('userPresence', {
      userId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage('getUserStatus')
  async handleGetUserStatus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() userId: number,
  ) {
    const status = this.userPresence.get(userId) || {
      status: 'offline' as const,
      lastSeen: null,
    };
    return { userId, ...status };
  }

  @SubscribeMessage('getOnlineUsers')
  async handleGetOnlineUsers(@ConnectedSocket() client: AuthenticatedSocket) {
    const onlineUsers = Array.from(this.userPresence.entries())
      .filter(([_, presence]) => presence.status === 'online')
      .map(([userId, presence]) => ({
        userId,
        lastSeen: presence.lastSeen?.toISOString(),
      }));

    return { onlineUsers };
  }

  // Helper method to get socket instance
  getServer(): Server {
    return this.server;
  }

  private async notifyChatUpdate(chatId: number, userId: number, message: any) {
    try {
      // Get the chat details
      const chat = await this.chatService.getChatDetails(chatId);
      const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;

      // Get the updated unread count for the recipient
      const unreadCount = await this.chatService.getUnreadCount(chatId, otherUserId);

      // Prepare the update data
      const updateData: ChatUpdateData = {
        chatId,
        lastMessage: message.message,
        lastMessageAt: new Date(),
        unreadCount,
        senderId: userId
      };

      // Get the recipient's sockets
      const recipientSockets = this.userSockets.get(otherUserId);
      if (recipientSockets) {
        const socketIds = Array.from(recipientSockets);
        socketIds.forEach(socketId => {
          this.server.to(socketId).emit('chatUpdated', updateData);
        });
      }

      // Also update the sender's chat list (in case they have multiple tabs open)
      const senderSockets = this.userSockets.get(userId);
      if (senderSockets) {
        const socketIds = Array.from(senderSockets);
        socketIds.forEach(socketId => {
          this.server.to(socketId).emit('chatUpdated', {
            ...updateData,
            unreadCount: 0 // Sender has read the message they just sent
          });
        });
      }
    } catch (error) {
      this.logger.error(`Error notifying chat update: ${error.message}`, error.stack);
    }
  }

  @SubscribeMessage('markAsRead')
  async handleMarkAsRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { chatId: number }
  ) {
    try {
      const user = client.data.user;
      await this.chatService.markMessagesAsRead(data.chatId, user.userId);
      
      // Notify all tabs that messages were read
      const updateData = {
        chatId: data.chatId,
        unreadCount: 0,
        lastReadAt: new Date()
      };

      const userSockets = this.userSockets.get(user.userId);
      if (userSockets) {
        const socketIds = Array.from(userSockets);
        socketIds.forEach(socketId => {
          this.server.to(socketId).emit('messagesRead', updateData);
        });
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Error marking messages as read:', error);
      return { success: false, error: error.message };
    }
  }
}
