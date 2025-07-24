import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStripeService } from '../shared/paymentStripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPaymentIntentDto } from './dtos/create-payment-intent.dto';

@Injectable()
export class StripeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly paymentStripeService: PaymentStripeService,
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

  async createPaymentIntent(body: createPaymentIntentDto) {
    const { gigId, userId, providerId, amount } = body;

    const clientSecret = await this.paymentStripeService.createPaymentIntent(
      amount,
      {
        gigId,
        userId,
        providerId,
      },
    );

    return { clientSecret };
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
      amount: 50000, // same as payment amount
      currency: 'inr',
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
}
