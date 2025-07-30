import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { StripeService } from './stripe.service';
import { CreateGigCheckoutDto } from './dtos/create-gig-checkout-session.dto';

@Controller('payment')
export class StripeController {
  constructor(private readonly stripeService: StripeService) {}

  private getRawBody(request: Request): Buffer {
    if ((request as any).rawBody) {
      return (request as any).rawBody;
    }

    if (Buffer.isBuffer(request.body)) {
      return request.body;
    }

    if (typeof request.body === 'string') {
      return Buffer.from(request.body);
    }

    return Buffer.from(JSON.stringify(request.body));
  }

  @Post('provider/onboard')
  async onboardProvider(@Body('providerId') providerId: number) {
    return this.stripeService.generateOnboardLink(providerId);
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

  @Post('webhooks/stripe')
  async handleStripeEvent(
    @Req() request: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    const body = this.getRawBody(request);
    return this.stripeService.handleStripeGigPaymentWebhook(body, signature);
  }

  @Post('webhooks/stripe/connect')
  async handleStripeEventConnect(
    @Req() request: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    const body = this.getRawBody(request);
    return this.stripeService.handleStripeOnBoadrdWebhook(body, signature);
  }
}
