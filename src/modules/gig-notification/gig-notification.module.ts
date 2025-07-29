import { Module } from '@nestjs/common';
import { GigNotificationCron } from './gig-notification.cron';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StripeModule } from '../stripe/stripe.module';

@Module({
  imports: [PrismaModule, NotificationsModule, StripeModule],
  providers: [GigNotificationCron],
})
export class GigNotificationModule {}
