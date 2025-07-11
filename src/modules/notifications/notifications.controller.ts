import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt.auth.guard';
import { Request } from 'express';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getUserNotifications(@Req() req: Request) {
    const user = req.user as any;
    return this.notificationsService.getUserNotifications(Number(user.id));
  }

  @Post('mark-read')
  async markNotificationRead(@Body() body: { notificationId: number }, @Req() req: Request) {
    const user = req.user as any;
    return this.notificationsService.markNotificationRead(body.notificationId, Number(user.id));
  }
} 