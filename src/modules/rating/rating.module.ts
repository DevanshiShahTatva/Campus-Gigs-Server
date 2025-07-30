import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingService } from './rating.service';
import { RatingController } from './rating.controller';
import { UserModule } from '../user/user.module';
import { StripeModule } from '../stripe/stripe.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, UserModule, StripeModule, NotificationsModule],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule { }