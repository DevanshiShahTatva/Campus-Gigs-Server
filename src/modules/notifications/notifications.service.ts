import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserNotifications(userId: number) {
    return this.prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async markNotificationRead(notificationId: number, userId: number) {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { is_read: true },
    });

    return this.prisma.notification.deleteMany({
      where: { id: notificationId, user_id: userId, is_read: true },
    });
  }

  async createNotification(userId: number, data: { title?: string; message?: string; type: string; link?: string }) {
    return this.prisma.notification.create({
      data: {
        user_id: userId,
        title: data.title,
        description: data.message,
        notification_type: data.type,
        link: data.link,
      },
    });
  }

  async markAllNotificationsRead(userId: number) {
    await this.prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });

    return this.prisma.notification.deleteMany({
      where: { user_id: userId, is_read: true },
    });
  }
} 