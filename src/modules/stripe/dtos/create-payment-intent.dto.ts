import { IsNumber } from 'class-validator';

export class createPaymentIntentDto {
  @IsNumber()
  gigId: number;

  @IsNumber()
  userId: number;

  @IsNumber()
  providerId: number;

  @IsNumber()
  amount: number;
}
