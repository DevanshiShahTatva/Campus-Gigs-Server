import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class PaymentStripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-06-30.basil',
    });
  }

  getInstance() {
    return this.stripe;
  }

  async createConnectedAccount(email: string): Promise<string> {
    const account = await this.stripe.accounts.create({
      type: 'express',
      country: 'US', // Change to 'US' if you're testing with US accounts
      email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    return account.id; // Save this to your DB
  }

  async createPaymentIntent(amount: number, metadata: Record<string, any>) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount, // in paise (e.g. ₹500 = 50000)
      currency: 'USD',
      payment_method_types: ['card'],
      metadata, // add gigId, userId, providerId
    });

    return paymentIntent.client_secret;
  }
}
