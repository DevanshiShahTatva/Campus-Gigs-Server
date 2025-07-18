import { Module } from '@nestjs/common';
import { PaymentHistoryController } from './paymentHistory.controller';
import { PaymentHistoryService } from './paymentHistory.service';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [AuthModule, UserModule],
  controllers: [PaymentHistoryController],
  providers: [PaymentHistoryService],
  exports: [],
})
export class PaymentHistoryModule {}
