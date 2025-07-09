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

@Injectable()
export class PaypalService {
  private client: Client;
  private ordersController: OrdersController;

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService,
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
}
