import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';

import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { ChatGateway } from './gateways/chat.gateway';
import { AwsS3Service } from '../shared/aws-s3.service';
import { NotificationGateway } from '../shared/notification.gateway';

@Module({
  imports: [PrismaModule, AuthModule, UserModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, AwsS3Service, NotificationGateway],
  exports: [ChatService],
})
export class ChatModule {}
