import { Controller, Get, Req } from '@nestjs/common';
import { PaymentHistoryService } from './paymentHistory.service';

@Controller('payment-history')
export class PaymentHistoryController {
  constructor(private paymentHistoryService: PaymentHistoryService) {}

  @Get('')
  async getPaymentHistory(
    @Req() req: any
  ) {
    const userId = req.user.id;
    const data = await this.paymentHistoryService.getPaymentHistory(Number(userId));
    return { data: data, message: "Payment history fetch successfully" }
  }
}
