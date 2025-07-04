import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateChatDto,
  SendMessageDto,
  GetChatMessagesDto,
  GetUserChatsDto,
} from './chat.dto';
import { MESSAGE_TYPE } from 'src/utils/enums';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(private prismaService: PrismaService) {}

  async createChat(createChatDto: CreateChatDto) {
    // Check if users exist
    const users = await this.prismaService.user.findMany({
      where: {
        id: { in: [createChatDto.user1Id, createChatDto.user2Id] },
      },
    });

    if (users.length !== 2) {
      throw new BadRequestException('One or both users not found');
    }

    // Check if chat already exists between these users
    const existingChat = await this.prismaService.chat.findFirst({
      where: {
        OR: [
          {
            user1Id: createChatDto.user1Id,
            user2Id: createChatDto.user2Id,
          },
          {
            user1Id: createChatDto.user2Id,
            user2Id: createChatDto.user1Id,
          },
        ],
        is_deleted: false,
      },
    });

    if (existingChat) {
      return existingChat;
    }

    // Create new chat
    return this.prismaService.chat.create({
      data: {
        user1Id: createChatDto.user1Id,
        user2Id: createChatDto.user2Id,
      },
      include: {
        user1: true,
        user2: true,
      },
    });
  }

  async sendMessage(
    senderId: number,
    chatId: number,
    sendMessageDto: SendMessageDto,
  ) {
    // Verify chat exists and user is a participant
    const chat = await this.prismaService.chat.findFirst({
      where: {
        id: chatId,
        is_deleted: false,
        OR: [{ user1Id: senderId }, { user2Id: senderId }],
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found or access denied');
    }

    // Create message
    return this.prismaService.message.create({
      data: {
        sender_id: senderId,
        chat_id: chatId,
        message: sendMessageDto.message,
        message_type: sendMessageDto.messageType || MESSAGE_TYPE.TEXT,
      },
      include: {
        sender: true,
      },
    });
  }

  async getChatMessages(
    userId: number,
    chatId: number,
    query: GetChatMessagesDto,
  ) {
    // Verify chat exists and user is a participant
    const chat = await this.prismaService.chat.findFirst({
      where: {
        id: chatId,
        is_deleted: false,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found or access denied');
    }

    const skip = (query.page - 1) * query.pageSize;

    // Get messages with pagination
    const [messages, total] = await Promise.all([
      this.prismaService.message.findMany({
        where: {
          chat_id: chatId,
          is_deleted: false,
        },
        include: {
          sender: true,
        },
        orderBy: {
          created_at: 'desc',
        },
        skip,
        take: query.pageSize,
      }),
      this.prismaService.message.count({
        where: {
          chat_id: chatId,
          is_deleted: false,
        },
      }),
    ]);

    return {
      data: messages.reverse(), // Return oldest first
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  async getChatDetails(chatId: number) {
    try {
      const chat = await this.prismaService.chat.findUnique({
        where: { id: chatId },
        include: {
          user1: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          user2: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!chat) {
        throw new NotFoundException('Chat not found');
      }

      return chat;
    } catch (error) {
      this.logger.error(`Failed to get chat details: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to retrieve chat details');
    }
  }

  async getUnreadCount(chatId: number, userId: number): Promise<number> {
    return this.prismaService.message.count({
      where: {
        chat_id: chatId,
        // Messages sent by others that this user hasn't read
        AND: [
          { sender_id: { not: userId } },
          { is_read: false },
          { is_deleted: false }
        ]
      },
    });
  }

  async markMessagesAsRead(chatId: number, userId: number) {
    try {
      await this.prismaService.message.updateMany({
        where: {
          chat_id: chatId,
          sender_id: { not: userId },
          is_read: false,
          is_deleted: false
        },
        data: {
          is_read: true,
          read_at: new Date()
        }
      });
      return { success: true };
    } catch (error) {
      this.logger.error('Error marking messages as read', error);
      return { success: false, error: 'Failed to mark messages as read' };
    }
  }

  async getUserChats(userId: number, query: GetUserChatsDto) {
    const skip = (query.page - 1) * query.pageSize;

    const [chats, total] = await Promise.all([
      this.prismaService.chat.findMany({
        where: {
          is_deleted: false,
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
        include: {
          user1: true,
          user2: true,
          messages: {
            orderBy: {
              created_at: 'desc',
            },
            take: 1,
          },
        },
        orderBy: {
          updated_at: 'desc',
        },
        skip,
        take: query.pageSize,
      }),
      this.prismaService.chat.count({
        where: {
          is_deleted: false,
          OR: [{ user1Id: userId }, { user2Id: userId }],
        },
      }),
    ]);

    // Format response to include the other user's info and last message
    const formattedChats = chats.map((chat) => {
      const otherUser = chat.user1Id === userId ? chat.user2 : chat.user1;
      const lastMessage = chat.messages[0] || null;

      return {
        id: chat.id,
        otherUser: {
          id: otherUser.id,
          name: otherUser.name,
          email: otherUser.email,
          profile: otherUser.profile,
        },
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              message: lastMessage.message,
              messageType: lastMessage.message_type,
              createdAt: lastMessage.created_at,
              isMine: lastMessage.sender_id === userId,
            }
          : null,
        unreadCount: 0, // You can implement unread count logic if needed
        updatedAt: chat.updated_at,
      };
    });

    return {
      data: formattedChats,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
