import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { GIG_STATUS } from '../../utils/enums';
import { UserNotificationPayload } from '../shared/notification.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationGateway } from '../shared';

@Injectable()
export class GigNotificationCron {

  constructor(
    private prismaService: PrismaService,
    private notificationGateway: NotificationGateway,
    private notificationsService: NotificationsService,
  ) { }

  @Cron(CronExpression.EVERY_MINUTE)
  async processGigNotifications() {
    const now = new Date();

    const ratingReminderGigs = await this.prismaService.gigs.findMany({
      where: {
        status: GIG_STATUS.COMPLETED,
        rating: null,
        has_before_reminder_sent: false,
        rating_reminder_time: { lte: now },
      },
      include: { user: true, provider: true },
    });

    for (const gig of ratingReminderGigs) {
      await this.sendRatingReminderNotification(gig);
      await this.prismaService.gigs.update({
        where: { id: gig.id },
        data: { has_before_reminder_sent: true },
      });
    }

    const paymentReleaseGigs = await this.prismaService.gigs.findMany({
      where: {
        status: GIG_STATUS.COMPLETED,
        rating: null,
        has_after_reminder_sent: false,
        payment_release_time: { lte: now },
      },
      include: { user: true, provider: true },
    });

    for (const gig of paymentReleaseGigs) {
      await this.sendPaymentReleaseNotification(gig);
      await this.prismaService.gigs.update({
        where: { id: gig.id },
        data: { has_after_reminder_sent: true },
      });
    }
  }

  private async sendRatingReminderNotification(gig: any) {
    const payload: UserNotificationPayload = {
      title: 'Rating Reminder - Action Required',
      message: `Don't forget to rate and review your completed gig: "${gig.title}". Payment will be automatically released to ${gig.provider.name} after 5 minutes if no rating is provided.`,
      type: 'warning',
      link: `/my-gigs`,
    };

    await this.notificationsService.createNotification(Number(gig.user_id), {
      title: payload.title,
      message: payload.message,
      type: payload.type,
      link: payload.link,
    });

    this.notificationGateway.server.to(`user_${gig.user_id}`).emit('userNotification', payload);
  }

  private async sendPaymentReleaseNotification(gig: any) {
    const payload: UserNotificationPayload = {
      title: 'Payment Released',
      message: `Payment has been automatically released to ${gig.provider.name} for your completed gig: "${gig.title}".Now you cannot rate or review this gig.`,
      type: 'info',
      link: `/my-gigs`,
    };

    await this.notificationsService.createNotification(Number(gig.user_id), {
      title: payload.title,
      message: payload.message,
      type: payload.type,
      link: payload.link,
    });

    this.notificationGateway.server.to(`user_${gig.user_id}`).emit('userNotification', payload);
  }
}