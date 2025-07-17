import { Module } from '@nestjs/common';
import { BidsService } from './bids.service';
import { BidsController } from './bids.controller';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { NotificationGateway } from '../shared/notification.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, UserModule, NotificationsModule],
  providers: [BidsService, NotificationGateway],
  controllers: [BidsController]
})
export class BidsModule {}
