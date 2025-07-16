import { Module, forwardRef } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { UserFromToken } from '../shared/userFromToken.service';
import { BuyPlanModule } from '../buy-plan/buy-plan.module';
import { NotificationGateway } from '../shared/notification.gateway';

@Module({
  imports: [AuthModule, UserModule, forwardRef(() => BuyPlanModule)],
  controllers: [ProfileController],
  providers: [ProfileService, UserFromToken],
  exports: [ProfileService],
})

export class ProfileModule {}
