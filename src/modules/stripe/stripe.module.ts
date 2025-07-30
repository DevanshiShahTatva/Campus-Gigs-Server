import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { PaymentStripeService } from '../shared/paymentStripe.service';

@Module({
  imports: [],
  controllers: [StripeController],
  providers: [StripeService, PaymentStripeService],
  exports: [StripeService],
})
export class StripeModule {}
