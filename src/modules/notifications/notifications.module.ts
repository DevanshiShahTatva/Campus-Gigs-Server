import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [AuthModule, UserModule],
  providers: [NotificationsService, PrismaService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {} 