import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
  HttpCode,
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
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  constructor(
    private prismaService: PrismaService,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
    private readonly awsS3Service: AwsS3Service,
    private readonly cloudinaryService: CloudinaryService
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
      const upload = await this.cloudinaryService.saveFileToCloud("chat", file);
      const imageUrl = upload.url;
      attachmentsData.push({
        url: imageUrl,
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

    // Determine recipient
    let recipientId: number;
    let senderName: string = message.sender?.name || 'someone';
    if (chat.user1Id === senderId) {
      recipientId = chat.user2Id;
    } else {
      recipientId = chat.user1Id;
    }

    // Emit to chat room
    this.chatGateway.getServer().to(`chat_${chatId}`).emit('newMessage', { message });

// Fetch recipient's notification preferences
const recipientNotificationPreferences =
  await this.prismaService.notificationPreferences.findFirst({
    where: {
      user: {
        id: recipientId,
      },
    },
  });
if (
  !recipientNotificationPreferences ||
  recipientNotificationPreferences.show_chat
) {
  // Emit chat notification to recipient
  this.chatGateway.emitNewMessage(chatId, {
    ...message,
    recipient_id: recipientId,
    sender_id: senderId,
    sender_name: senderName,
  });
}

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
  async updateMessage({
    userId,
    chatId,
    messageId,
    message,
    existingAttachmentIds = [],
    files = [],
  }: {
    userId: number;
    chatId: number;
    messageId: number;
    message?: string;
    existingAttachmentIds?: number[];
    files?: Express.Multer.File[];
  }) {
    // 1. Verify message exists, belongs to chat, and user is sender
    const msg = await this.prismaService.message.findUnique({
      where: { id: messageId },
      include: { attachments: true },
    });
    if (!msg || msg.chat_id !== chatId || msg.sender_id !== userId) {
      throw new NotFoundException('Message not found or access denied');
    }

    // 2. Remove attachments not in existingAttachmentIds
    let toRemove: { id: number; url: string }[] = [];
    if (msg.attachments.length > 0 && existingAttachmentIds) {
      toRemove = msg.attachments.filter(
        (a) => !existingAttachmentIds.includes(a.id),
      );
      // Delete S3 files for removed attachments
      for (const attachment of toRemove) {
        try {
          const pubKey = this.cloudinaryService.extractPublicIdFromUrl(attachment.url);
          if (pubKey) {
            await this.cloudinaryService.deleteFromCloudinary(pubKey);
          }
        } catch (err) {
          this.logger.warn(
            `Failed to delete S3 file for attachment id ${attachment.id}: ${err.message}`,
          );
        }
      }
      if (toRemove.length > 0) {
        await this.prismaService.attachmentChat.deleteMany({
          where: { id: { in: toRemove.map((a) => a.id) } },
        });
      }
    }

    // 3. Upload new files and create new attachments
    const newAttachments: any[] = [];
    for (const file of (files || []).slice(0, 5)) {
      const upload = await this.cloudinaryService.saveFileToCloud("chat", file);
      newAttachments.push({
        url: upload.url,
        type: file.mimetype.startsWith('image') ? 'image' : 'file',
        filename: file.originalname,
        mimetype: file.mimetype,
        file_size: file.size,
        message_id: messageId,
      });
    }
    if (newAttachments.length > 0) {
      await this.prismaService.attachmentChat.createMany({
        data: newAttachments,
      });
    }

    // 4. Update message text
    const updated = await this.prismaService.message.update({
      where: { id: messageId },
      data: { message: message ?? msg.message },
      include: { attachments: true },
    });

    // Emit socket event for message update
    this.chatGateway.emitMessageUpdated(chatId, updated);

    // Check if this is the latest message in the chat
    const lastMessage = await this.prismaService.message.findFirst({
      where: { chat_id: chatId },
      orderBy: { created_at: 'desc' },
      include: { attachments: true },
    });
    if (lastMessage && lastMessage.id === updated.id) {
      const chatRecord = await this.prismaService.chat.findUnique({
        where: { id: chatId },
        select: { user1Id: true, user2Id: true },
      });
      if (chatRecord) {
        this.chatGateway.emitLatestMessageToUser(chatRecord.user1Id, updated);
        this.chatGateway.emitLatestMessageToUser(chatRecord.user2Id, updated);
      }
    }

    return {
      success: true,
      data: updated,
      message: 'Message updated successfully',
    };
  }

  async deleteMessage(messageId: number, userId: number) {
    const message = await this.prismaService.message.findUnique({
      where: { id: messageId },
    });
    if (!message || message.sender_id !== userId)
      throw new NotFoundException('Not allowed');

    // 4. Mark message as deleted
    const deletedMessage = await this.prismaService.message.update({
      where: { id: messageId },
      data: { is_deleted: true, deleted_at: new Date() },
    });

    // Emit messageDeleted event to chat room
    const chat = await this.prismaService.message.findUnique({
      where: { id: messageId },
      select: { chat_id: true },
    });
    if (chat) {
      this.chatGateway.emitMessageDeleted(chat.chat_id, messageId);

      // Check if this was the last message
      const lastMessage = await this.prismaService.message.findFirst({
        where: {
          chat_id: chat.chat_id,
        },
        orderBy: { created_at: 'desc' },
        include: { attachments: true },
      });

      if (lastMessage && lastMessage.id === deletedMessage.id) {
        const chatRecord = await this.prismaService.chat.findUnique({
          where: { id: chat.chat_id },
          select: { user1Id: true, user2Id: true },
        });
        if (chatRecord) {
          // If no messages left, send null; else send new last message
          this.chatGateway.emitLatestMessageToUser(
            chatRecord.user1Id,
            lastMessage || null,
          );
          this.chatGateway.emitLatestMessageToUser(
            chatRecord.user2Id,
            lastMessage || null,
          );
        }
      }
    }
    return {
      success: true,
      message: 'Message deleted successfully',
    };
  }

  async getChatDetails(
    userId: number,
    chatId: number,
    query?: { search?: string },
  ) {
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

    let messages: any[] = [];
    if (query && query.search) {
      messages = await this.prismaService.message.findMany({
        where: {
          chat_id: +chatId,
          is_deleted: false,
          message: { contains: query.search, mode: 'insensitive' },
        },
        orderBy: { created_at: 'desc' },
        include: { sender: true, attachments: true },
      });
    }

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
      ...(query && query.search ? { messages } : {}),
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
            include: {
              attachments: true,
            },
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
      const other_user = chat.user1Id === userId ? chat.user2 : chat.user1;
      const last_message = chat.messages[0] || null;
      return {
        id: chat.id,
        other_user: {
          id: other_user.id,
          name: other_user.name,
          email: other_user.email,
          profile: other_user.profile,
        },
        last_message: last_message
          ? {
              id: last_message.id,
              message: last_message.message,
              created_at: last_message.created_at,
              deleted_at: last_message.deleted_at,
              attachments: last_message.attachments,
              is_mine: last_message.sender_id === userId,
              is_deleted: last_message.is_deleted,
            }
          : null,
        unread_count: unreadCountMap.get(chat.id) || 0,
        updated_at: chat.updated_at,
      };
    });

    let filteredChats = formattedChats;
    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filteredChats = formattedChats.filter(chat =>
        chat.other_user.name && chat.other_user.name.toLowerCase().includes(searchLower)
      );
    }

    return {
      data: filteredChats,
      meta: {
        total: filteredChats.length,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.ceil(filteredChats.length / query.pageSize),
      },
      message: 'User chats fetched successfully',
    };
  }
}
