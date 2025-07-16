import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  Environment,
  LogLevel,
  CheckoutPaymentIntent,
  OrdersController,
  ApiError,
} from '@paypal/paypal-server-sdk';
import { SubscriptionPlan } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from 'src/modules/prisma/prisma.service';

@Injectable()
export class PaypalService {
  private client: Client;
  private ordersController: OrdersController;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
    private prismaService: PrismaService
  ) {
    this.initializePaypalClient();
  }

  private initializePaypalClient() {
    this.client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: this.configService.get<string>('PAYPAL_CLIENT_ID')!,
        oAuthClientSecret: this.configService.get<string>('PAYPAL_CLIENT_SECRET')!,
      },
      timeout: 0,
      environment: Environment.Sandbox,
      logging: {
        logLevel: LogLevel.Info,
        logRequest: {
          logBody: true,
        },
        logResponse: {
          logHeaders: true,
        },
      },
    });

    this.ordersController = new OrdersController(this.client);
  }

  async createOrder(amount: string, currency: string = 'USD') {
    const collect = {
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            amount: {
              currencyCode: currency,
              value: amount,
            },
          },
        ],
      },
      prefer: 'return=minimal',
    };

    try {
      const { body, ...httpResponse } =
        await this.ordersController.createOrder(collect);
      return {
        data: typeof body === 'string' ? JSON.parse(body) : body,
        statusCode: httpResponse.statusCode,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw new BadRequestException(`PayPal API Error: ${error.message}`);
      }
      throw error;
    }
  }

  async captureOrder(orderId: string) {
    const collect = {
      id: orderId,
      prefer: 'return=minimal',
    };

    try {
      const { body, ...httpResponse } =
        await this.ordersController.captureOrder(collect);

      return {
        data: typeof body === 'string' ? JSON.parse(body) : body,
        statusCode: httpResponse.statusCode,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(`PayPal API Error: ${error.message}`);
      }
      throw error;
    }
  }

  private async getAccessToken(): Promise<string> {
    const auth = Buffer.from(
      `${this.configService.get('PAYPAL_CLIENT_ID')}:${this.configService.get('PAYPAL_CLIENT_SECRET')}`,
    ).toString('base64');

    const response = await axios.post(
      'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    return response.data.access_token;
  }

  private async getHttpClient(): Promise<AxiosInstance> {
    const token = await this.getAccessToken();
    return axios.create({
      baseURL: 'https://api-m.sandbox.paypal.com',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createOrGetPaypalProduct(plan: SubscriptionPlan) {
    if (plan.paypal_product_id) return { id: plan.paypal_product_id };

    const http = await this.getHttpClient();

    const requestBody = {
      name: plan.name,
      description: plan.description ?? 'App Subscription Plan',
      type: 'SERVICE',
      category: 'SOFTWARE',
    };

    const response = await http.post('/v1/catalogs/products', requestBody);
    const productId = response.data.id;

    await this.prismaService.subscriptionPlan.update({
      where: { id: plan.id },
      data: { paypal_product_id: productId },
    });

    return { id: productId };
  }

  async createOrGetPaypalPlan(productId: string, plan: SubscriptionPlan) {
    if (plan.paypal_plan_id) return { id: plan.paypal_plan_id };

    const http = await this.getHttpClient();

    const requestBody = {
      product_id: productId,
      name: `${plan.name} Monthly Plan`,
      billing_cycles: [
        {
          frequency: {
            interval_unit: 'MONTH',
            interval_count: 1,
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: {
              value: plan.price.toFixed(2),
              currency_code: 'USD',
            },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    };

    const response = await http.post('/v1/billing/plans', requestBody);
    const paypalPlanId = response.data.id;

    await this.prismaService.subscriptionPlan.update({
      where: { id: plan.id },
      data: { paypal_plan_id: paypalPlanId },
    });

    return { id: paypalPlanId };
  }

  async createSubscriptionSession(plan: SubscriptionPlan) {
    const product = await this.createOrGetPaypalProduct(plan);
    const paypalPlan = await this.createOrGetPaypalPlan(product.id, plan);

    const http = await this.getHttpClient();

    const requestBody = {
      plan_id: paypalPlan.id,
      application_context: {
        brand_name: 'CampusGigs',
        user_action: 'SUBSCRIBE_NOW',
        // return_url: `${this.configService.get<string>('CLIENT_URL')!}/payment/success`,
        return_url: `https://ec2f23bdddea.ngrok-free.app/payment/success`,
        // cancel_url: `${this.configService.get<string>('CLIENT_URL')!}/payment/cancel`,
        cancel_url: `https://ec2f23bdddea.ngrok-free.app/payment/cancel`,
      },
    };

    const response = await http.post('/v1/billing/subscriptions', requestBody);

    return response.data; // contains subscriptionId + approval link
  }
}
