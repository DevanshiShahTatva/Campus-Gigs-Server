import { Module } from "@nestjs/common";
import { PaypalWebhookController } from "./paypal.controller";
import { PaypalWebhookService } from "./paypal.service";

@Module({
  controllers: [PaypalWebhookController],
  providers: [PaypalWebhookService],
})
export class PaypalModule {}
