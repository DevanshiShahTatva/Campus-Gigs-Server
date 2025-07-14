import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BuyPlanService } from './buy-plan.service';
import { BuyPlanController } from './buy-plan.controller';
import { SubscriptionPlanModule } from '../subscription-plan/subscription-plan.module';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaypalModule } from '../../shared/paypal.module';

@Module({
  imports: [
    ConfigModule,
    PaypalModule,
    forwardRef(() => AuthModule),
    forwardRef(() => SubscriptionPlanModule),
    forwardRef(() => UserModule),
    PrismaModule,
  ],
  controllers: [BuyPlanController],
  providers: [BuyPlanService],
  exports: [BuyPlanService],
})
export class BuyPlanModule {}
