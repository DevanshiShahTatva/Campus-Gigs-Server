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
  UseInterceptors,
  UploadedFiles,
  Delete,
  Patch,
  ParseIntPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';

import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../common/guards/jwt.auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateChatDto,
  SendMessageDto,
  GetChatMessagesDto,
  GetUserChatsDto,
  GetChatDetailsDto,
} from './chat.dto';
import { multerOptions } from 'src/utils/multer';

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
  @UseInterceptors(FilesInterceptor('files', 5, multerOptions))
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
    @Body() sendMessageDto: SendMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.chatService.sendMessage(
      req.user.id,
      +chatId,
      sendMessageDto,
      files,
    );
  }

  @Get(':chatId/messages')
  async getChatMessages(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
    @Query() query: GetChatMessagesDto,
  ) {
    return this.chatService.getChatMessages(req.user.id, +chatId, query);
  }

  @Get()
  async getUserChats(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetUserChatsDto,
  ) {
    return this.chatService.getUserChats(req.user.id, query);
  }

  @Get(':chatId')
  async getChatDetails(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number,
    @Query() query: GetChatDetailsDto,
  ) {
    const userId = req.user.id;
    return this.chatService.getChatDetails(userId, +chatId, query);
  }

  @Patch(':chatId/messages/:messageId')
  @UseInterceptors(FilesInterceptor('files'))
  async updateMessage(
    @Req() req: AuthenticatedRequest,
    @Param('chatId') chatId: number | ParseIntPipe,
    @Param('messageId') messageId: number | ParseIntPipe,
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.chatService.updateMessage({
      userId: req.user.id,
      chatId: +chatId,
      messageId: +messageId,
      message: body.message,
      existingAttachmentIds: body.existingAttachmentIds
        ? typeof body.existingAttachmentIds === 'string'
          ? JSON.parse(body.existingAttachmentIds)
          : body.existingAttachmentIds
        : [],
      files: files || [],
    });
  }

  @Delete(':messageId')
  async deleteMessage(
    @Req() req: AuthenticatedRequest,
    @Param('messageId') messageId: number,
  ) {
    return this.chatService.deleteMessage(messageId, req.user.id);
  }
}
