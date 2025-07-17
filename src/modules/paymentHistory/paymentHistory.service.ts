import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentHistoryService {
  constructor(private prismaService: PrismaService) {}

  async getPaymentHistory(userId: number) {
    return await this.prismaService.paymentHistory.findMany({
      where: { user_id: userId },
    });
  }
}
