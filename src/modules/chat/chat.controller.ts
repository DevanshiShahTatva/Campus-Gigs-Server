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
    id: number;
    email: string;
    role: string;
  };
}

@Controller('chats')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @Roles('user')
  async createChat(
    @Req() req: AuthenticatedRequest,
    @Body() createChatDto: CreateChatDto,
  ) {
    if (req.user.id === createChatDto.userId) {
      throw new BadRequestException(
        'You can only create a chat with another user',
      );
    }

    return this.chatService.createChat({
      user1Id: req.user.id,
      user2Id: createChatDto.userId,
    });
  }

  @Post(':chatId/messages')
  @Roles('user')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    console.log('User sending message:', req.user.id, chatId, sendMessageDto);
    return this.chatService.sendMessage(req.user.id, +chatId, sendMessageDto);
  }

  @Get(':chatId/messages')
  @Roles('user')
  async getChatMessages(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
    @Query() query: GetChatMessagesDto,
  ) {
    return this.chatService.getChatMessages(req.user.id, +chatId, query);
  }

  @Get()
  @Roles('user')
  async getUserChats(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetUserChatsDto,
  ) {
    return this.chatService.getUserChats(req.user.id, query);
  }

  @Get(':chatId')
  @Roles('user')
  async getChatDetails(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
  ) {
    const userId = req.user.id;
    return this.chatService.getChatDetails(userId, +chatId);
  }
}
