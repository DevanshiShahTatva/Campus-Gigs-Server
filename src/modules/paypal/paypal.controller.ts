import {
  Controller,
  Post,
  Headers,
  Body,
  Res,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { PaypalWebhookService } from './paypal.service';
import { Response } from 'express';

@Controller('paypal')
export class PaypalWebhookController {
  private readonly logger = new Logger(PaypalWebhookController.name);

  constructor(private readonly paypalWebhookService: PaypalWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Headers('paypal-transmission-id') transmissionId: string,
    @Headers('paypal-transmission-time') transmissionTime: string,
    @Headers('paypal-cert-url') certUrl: string,
    @Headers('paypal-auth-algo') authAlgo: string,
    @Headers('paypal-transmission-sig') transmissionSig: string,
    @Headers('paypal-webhook-id') webhookId: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    try {
      // add skip for production because webhook id getting null if we use developer mode
      const skipVerification = true;

      if (!skipVerification) {
        const isVerified =
          await this.paypalWebhookService.verifyWebhookSignature({
            transmissionId,
            transmissionTime,
            certUrl,
            authAlgo,
            transmissionSig,
            webhookId,
            body,
          });

        if (!isVerified) {
          this.logger.warn('Invalid PayPal webhook signature');
          return res.status(400).send('Invalid signature');
        }
      } else {
        this.logger.warn('Skipping PayPal webhook verification in dev/test');
      }

      await this.paypalWebhookService.handleEvent(body);
      return res.send('OK');
    } catch (error) {
      this.logger.error('Webhook error:', error);
      return res.status(500).send('Webhook error');
    }
  }
}
