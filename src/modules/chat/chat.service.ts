import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  SendMessageDto,
  GetChatMessagesDto,
  GetUserChatsDto,
} from './chat.dto';
import { ChatGateway } from './gateways/chat.gateway';
import { MESSAGE_TYPE } from 'src/utils/enums';
import { AwsS3Service } from '../shared/aws-s3.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    private prismaService: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
    private readonly awsS3Service: AwsS3Service,
  ) {}

  async createChat(createChatDto: { user1Id: number; user2Id: number }) {
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
      include: {
        user1: true,
        user2: true,
      },
    });

    if (existingChat) {
      return {
        data: existingChat,
        message: 'Chat already exists',
      };
    }

    // Create new chat
    const chat = await this.prismaService.chat.create({
      data: {
        user1Id: createChatDto.user1Id,
        user2Id: createChatDto.user2Id,
      },
      include: {
        user1: true,
        user2: true,
      },
    });

    return {
      data: chat,
      message: 'Chat created successfully',
    };
  }

  async sendMessage(
    senderId: number,
    chatId: number,
    sendMessageDto: SendMessageDto,
    files: Express.Multer.File[] = [],
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

    // Upload files to S3 and prepare attachment data
    const attachmentsData: {
      url: string;
      type: string;
      filename: string;
      mimetype: string;
      file_size: number;
    }[] = [];
    // Limit to 5 files
    for (const file of (files || []).slice(0, 5)) {
      const url = await this.awsS3Service.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        'chat',
      );
      attachmentsData.push({
        url,
        type: file.mimetype.startsWith('image') ? 'image' : 'file',
        filename: file.originalname,
        mimetype: file.mimetype,
        file_size: file.size,
      });
    }

    // Create message with attachments
    const message = await this.prismaService.message.create({
      data: {
        sender_id: senderId,
        chat_id: chatId,
        message: sendMessageDto.message || '',
        attachments: {
          create: attachmentsData,
        },
      },
      include: {
        sender: true,
        attachments: true,
      },
    });

    this.chatGateway
      .getServer()
      .to(`chat_${chatId}`)
      .emit('newMessage', { message });

    // Emit latest message to both users' sidebar channels
    const chatRecord = await this.prismaService.chat.findUnique({
      where: { id: chatId },
      select: { user1Id: true, user2Id: true },
    });
    if (chatRecord) {
      this.chatGateway.emitLatestMessageToUser(chatRecord.user1Id, message);
      this.chatGateway.emitLatestMessageToUser(chatRecord.user2Id, message);
    }

    return {
      data: message,
      message: 'Message sent successfully',
    };
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

    // Get messages with pagination, including attachments
    const [messages, total] = await Promise.all([
      this.prismaService.message.findMany({
        where: {
          chat_id: chatId,
          is_deleted: false,
        },
        include: {
          sender: true,
          attachments: true,
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
      data: messages,
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(total / query.pageSize),
      },
      message: 'Chat messages fetched successfully',
    };
  }

  async getRawChat(chatId: number) {
    // Returns the chat record with user1Id and user2Id for gateway logic
    return this.prismaService.chat.findFirst({
      where: { id: chatId, is_deleted: false },
      select: { id: true, user1Id: true, user2Id: true },
    });
  }

  // Soft delete message
  async deleteMessage(messageId: number, userId: number) {
    const message = await this.prismaService.message.findUnique({
      where: { id: messageId },
    });
    if (!message || message.sender_id !== userId)
      throw new NotFoundException('Not allowed');
    await this.prismaService.message.update({
      where: { id: messageId },
      data: { is_deleted: true, deleted_at: new Date() },
    });
    return { success: true };
  }

  async getChatDetails(userId: number, chatId: number) {
    // Get chat with participants and verify user is a participant
    const chat = await this.prismaService.chat.findFirst({
      where: {
        id: +chatId,
        is_deleted: false,
        OR: [{ user1Id: userId }, { user2Id: userId }],
      },
      include: {
        user1: true,
        user2: true,
      },
    });

    if (!chat) {
      throw new NotFoundException('Chat not found or access denied');
    }

    // Determine the other user in the chat
    const otherUser = chat.user1Id === userId ? chat.user2 : chat.user1;

    return {
      id: chat.id,
      otherUser: {
        id: otherUser.id,
        name: otherUser.name,
        email: otherUser.email,
        profile: otherUser.profile,
      },
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
    };
  }

  async getUnreadCount(chatId: number, userId: number): Promise<number> {
    return this.prismaService.message.count({
      where: {
        chat_id: chatId,
        // Messages sent by others that this user hasn't read
        AND: [
          { sender_id: { not: userId } },
          { is_read: false },
          { is_deleted: false },
        ],
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
          is_deleted: false,
        },
        data: {
          is_read: true,
          read_at: new Date(),
        },
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

    // Fetch unread counts for all chats for this user
    const unreadCounts = await this.prismaService.message.groupBy({
      by: ['chat_id'],
      where: {
        chat_id: { in: chats.map((chat) => chat.id) },
        is_read: false,
        is_deleted: false,
        sender_id: { not: userId },
      },
      _count: { id: true },
    });
    const unreadCountMap = new Map<number, number>();
    unreadCounts.forEach((uc) => unreadCountMap.set(uc.chat_id, uc._count.id));

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
              createdAt: lastMessage.created_at,
              deletedAt: lastMessage.deleted_at,
              isMine: lastMessage.sender_id === userId,
            }
          : null,
        unreadCount: unreadCountMap.get(chat.id) || 0,
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
      message: 'User chats fetched successfully',
    };
  }
}
