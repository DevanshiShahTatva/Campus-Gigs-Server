import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';

import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UserModule } from '../user/user.module';
import { UserService } from '../user/user.service';
import { AuthModule } from '../auth/auth.module';
// import { ChatGateway } from './gateways/chat.gateway';
// import { WsJwtAuthGuard } from '../../common/guards/ws-jwt-auth.guard';

@Module({
  imports: [PrismaModule, AuthModule, UserModule],
  controllers: [ChatController],
  providers: [
    ChatService,
  ],
  exports: [
    ChatService,
  ],
})
export class ChatModule {}
