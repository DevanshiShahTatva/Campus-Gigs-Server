import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStripeService } from '../shared/paymentStripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGigCheckoutDto } from './dtos/create-gig-checkout-session.dto';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly paymentStripeService: PaymentStripeService,
    private readonly configService: ConfigService,
  ) {}

  async generateOnboardLink(providerId: number) {
    // 1. Check if provider already has account
    const existingProvider = await this.prismaService.user.findUnique({
      where: { id: providerId },
    });

    if (!existingProvider) {
      throw new NotFoundException('Provider not found');
    }

    let accountId = existingProvider.stripe_account_id;

    if (!accountId) {
      // 2. Create account and save it
      accountId = await this.paymentStripeService.createConnectedAccount(
        existingProvider.email,
      );

      await this.prismaService.user.update({
        where: { id: providerId },
        data: { stripe_account_id: accountId },
      });
    }

    // 3. Generate onboarding link
    const onboardingLink = await this.createAccountLink(accountId);
    return { url: onboardingLink };
  }

  async createAccountLink(accountId: string): Promise<string> {
    const accountLink = await this.paymentStripeService
      .getInstance()
      .accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.CLIENT_URL}/onboarding/refresh`,
        return_url: `${process.env.CLIENT_URL}/onboarding/return`,
        type: 'account_onboarding',
      });

    return accountLink.url;
  }

  async createGigPaymentCheckoutSession(body: CreateGigCheckoutDto) {
    const session = await this.paymentStripeService
      .getInstance()
      .checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency: 'USD',
              product_data: {
                name: body.gigTitle,
              },
              unit_amount: body.amount * 100,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          transfer_group: `gig_${body.gigId}`,
        },
        success_url: `${this.configService.get<string>('CLIENT_URL')!}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.configService.get<string>('CLIENT_URL')!}/payment/cancel?gig-payment=cancelled`,
        metadata: {
          gig_id: body.gigId,
          user_id: body.userId,
          amount: body.amount,
        },
      });

    return { url: session.url };
  }

  async realeasePayment(body: { gigId: number }) {
    const gigPayment = await this.prismaService.gigPayment.findFirst({
      where: { gig_id: body.gigId, payment_status: 'hold' },
      include: {
        gig: {
          include: { provider: true }, // get stripe_account_id
        },
      },
    });

    if (!gigPayment || !gigPayment.transaction_id) {
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Transaction not found for this gigs',
      });
    }

    if (!gigPayment.gig.provider?.stripe_account_id) {
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Provider does not yet KYC completed',
      });
    }

    const providerStripeId = gigPayment.gig.provider.stripe_account_id;

    // Transfer amount to provider
    await this.paymentStripeService.getInstance().transfers.create({
      amount: gigPayment.amount, // same as payment amount
      currency: 'USD',
      destination: providerStripeId,
      transfer_group: `gig_${body.gigId}`,
    });

    await this.prismaService.gigPayment.update({
      where: { gig_id: body.gigId },
      data: { payment_status: 'paid' },
    });

    return { success: true };
  }

  async refundPayment(body: { gigId: number }) {
    const gigPayment = await this.prismaService.gigPayment.findFirst({
      where: { gig_id: body.gigId, payment_status: 'hold' },
    });

    if (!gigPayment || !gigPayment.transaction_id) {
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Transaction not found for this gigs',
      });
    }

    await this.paymentStripeService.getInstance().refunds.create({
      payment_intent: gigPayment.transaction_id,
    });

    await this.prismaService.gigPayment.update({
      where: { gig_id: body.gigId },
      data: { payment_status: 'refunded' },
    });

    return { success: true };
  }

  async handleStripeGigPaymentWebhook(
    body: Buffer<ArrayBufferLike>,
    signature: string,
  ) {
    let event: Stripe.Event;

    try {
      event = this.paymentStripeService
        .getInstance()
        .webhooks.constructEvent(
          body,
          signature,
          this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!,
        );
    } catch (err) {
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      const transactionId = session.payment_intent as string;

      if (
        !session.metadata ||
        !session.metadata.gig_id ||
        !session.metadata.user_id ||
        !session.metadata.amount
      ) {
        throw new BadRequestException('Invalid or missing in metadata');
      }

      const gigId = Number(session.metadata.gig_id);
      const userId = Number(session.metadata.user_id);
      const amount = Number(session.metadata.amount);

      // Prevent duplicate entries
      const existing = await this.prismaService.gigPayment.findUnique({
        where: { gig_id: gigId },
      });

      if (!existing) {
        await this.prismaService.gigPayment.create({
          data: {
            gig_id: gigId,
            amount: amount,
            transaction_id: transactionId,
            payment_status: 'hold',
          },
        });

        await this.prismaService.paymentHistory.create({
          data: {
            user_id: userId,
            transaction_id: transactionId,
            type: 'gig_payment',
            description: 'Payment done successfully for gig.',
            amount: amount,
            paid_at: new Date(),
          },
        });
      }
    }

    return { received: true };
  }
}
