import { NotificationGateway } from './notification.gateway';
import { NotificationsService } from '../notifications/notifications.service';

export interface UserNotificationPayload {
  title?: string;
  message?: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link?: string;
}

export async function sendUserNotification(
  gateway: NotificationGateway,
  notificationsService: NotificationsService,
  userId: string | number,
  payload: UserNotificationPayload
) {
  // Persist notification in DB
  await notificationsService.createNotification(Number(userId), {
    title: payload.title,
    message: payload.message,
    type: payload.type,
    link: payload.link,
  });
  // Emit via socket
  gateway.server.to(`user_${userId}`).emit('userNotification', payload);
} 