import { Body, Controller, Post } from '@nestjs/common';
import { StripeService } from './stripe.service';
import { createPaymentIntentDto } from './dtos/create-payment-intent.dto';
import { CreateGigCheckoutDto } from './dtos/create-gig-checkout-session.dto';

@Controller('payment')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('provider/onboard')
  async onboardProvider(@Body('providerId') providerId: number) {
    return this.stripeService.generateOnboardLink(providerId);
  }

  @Post('user/pay')
  async createGigPaymentIntent(@Body() body: createPaymentIntentDto) {
    return this.stripeService.createPaymentIntent(body);
  }

  @Post('gig/checkout-session')
  async createGigCheckoutSession(@Body() body: CreateGigCheckoutDto) {
    return this.stripeService.createGigPaymentCheckoutSession(body);
  }

  @Post('release')
  async releasePayment(@Body() body: { gigId: number }) {
    return this.stripeService.realeasePayment(body);
  }

  @Post('refund')
  async refundPayment(@Body() body: { gigId: number }) {
    return this.stripeService.refundPayment(body);
  }
}
