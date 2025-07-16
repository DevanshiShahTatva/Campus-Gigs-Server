import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { BUY_PLAN_STATUS } from 'src/utils/enums';
import { PAYMENT_HISTORY_TYPE } from '@prisma/client';

@Injectable()
export class PaypalWebhookService {
  private readonly logger = new Logger(PaypalWebhookService.name);
  constructor(private prisma: PrismaService) {}

  async verifyWebhookSignature({
    transmissionId,
    transmissionTime,
    certUrl,
    authAlgo,
    transmissionSig,
    webhookId,
    body,
  }) {
    const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
    const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

    const tokenRes = await axios.post(
      'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString(
              'base64',
            ),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const accessToken = tokenRes.data.access_token;

    console.log('webhook_id::2', webhookId);

    const res = await axios.post(
      'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature',
      {
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: '123',
        webhook_event: body,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('res::2', res);

    return res.data.verification_status === 'SUCCESS';
  }

  async handleEvent(body: any) {
    const eventType = body.event_type;
    const subscriptionId = body.resource?.id;

    this.logger.log(
      `Received PayPal event: ${eventType} (subscription: ${subscriptionId})`,
    );

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await this.prisma.subscriptionPlanBuy.updateMany({
          where: {
            transaction_id: subscriptionId,
            status: BUY_PLAN_STATUS.ACTIVE,
          },
          data: {
            status: BUY_PLAN_STATUS.CANCELLED,
          },
        });
        this.logger.log(`Subscription ${subscriptionId} marked as CANCELLED`);
        break;

      case 'PAYMENT.SALE.COMPLETED':
        const sale = body.resource;
        const planId = sale.billing_agreement_id;
        const transactionId = sale.id;

        const plan = await this.prisma.subscriptionPlanBuy.findFirst({
          where: {
            transaction_id: planId,
            status: BUY_PLAN_STATUS.ACTIVE,
          },
        });

        if (!plan) {
          this.logger.warn(`No active plan found for subscription ${planId}`);
          return;
        }

        const existing = await this.prisma.paymentHistory.findUnique({
          where: { transaction_id: transactionId },
        });

        if (!existing) {
          await this.prisma.paymentHistory.create({
            data: {
              type: PAYMENT_HISTORY_TYPE.subscription,
              user_id: plan.user_id,
              transaction_id: transactionId,
              amount: parseFloat(sale.amount.total),
              paid_at: new Date(sale.create_time),
              description: "Payment has been retrived successfully as you have enabled auto debit."
            },
          });

          this.logger.log(
            `Recorded payment ${transactionId} for plan ${plan.id}`,
          );
        } else {
          this.logger.log(`Payment ${transactionId} already recorded`);
        }
        break;

      default:
        this.logger.warn(`Unhandled PayPal webhook event: ${eventType}`);
    }
  }
}
