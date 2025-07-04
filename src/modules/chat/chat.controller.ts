import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';

import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt.auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateChatDto,
  SendMessageDto,
  GetChatMessagesDto,
  GetUserChatsDto,
} from './chat.dto';

// Define custom request interface to extend Express Request
export interface AuthenticatedRequest extends Request {
  user: {
    userId: number;
    email: string;
    role: string;
  };
}

@Controller('chats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @Roles('user', 'admin')
  async createChat(
    @Req() req: AuthenticatedRequest,
    @Body() createChatDto: CreateChatDto,
  ) {
    // Ensure the authenticated user is one of the chat participants
    if (
      req.user.userId !== createChatDto.user1Id &&
      req.user.userId !== createChatDto.user2Id
    ) {
      throw new BadRequestException(
        'You can only create a chat with yourself and another user',
      );
    }

    return this.chatService.createChat(createChatDto);
  }

  @Post(':chatId/messages')
  @Roles('user', 'admin')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(
      req.user.userId,
      +chatId,
      sendMessageDto,
    );
  }

  @Get(':chatId/messages')
  @Roles('user', 'admin')
  async getChatMessages(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
    @Query() query: GetChatMessagesDto,
  ) {
    return this.chatService.getChatMessages(req.user.userId, +chatId, query);
  }

  @Get()
  @Roles('user', 'admin')
  async getUserChats(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetUserChatsDto,
  ) {
    return this.chatService.getUserChats(req.user.userId, query);
  }

  @Get(':chatId')
  @Roles('user', 'admin')
  async getChatDetails(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
  ) {
    const userId = req.user.userId;

    // Get chat with participants
    const chat = await this.chatService['prismaService'].chat.findFirst({
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
}
