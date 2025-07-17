import { Module } from '@nestjs/common';
import { PaymentHistoryController } from './paymentHistory.controller';
import { PaymentHistoryService } from './paymentHistory.service';

@Module({
  imports: [],
  controllers: [PaymentHistoryController],
  providers: [PaymentHistoryService],
  exports: [],
})
export class PaymentHistoryModule {}
