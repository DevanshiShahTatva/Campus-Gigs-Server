import { Module } from '@nestjs/common';
import { GigNotificationCron } from './gig-notification.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [GigNotificationCron],
})
export class GigNotificationModule {}
