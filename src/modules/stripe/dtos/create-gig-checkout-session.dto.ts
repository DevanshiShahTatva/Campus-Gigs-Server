import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsString } from 'class-validator';

export class CreateGigCheckoutDto {
  @IsNumber()
  @Type(() => Number)
  amount: number;

  @IsString()
  gigTitle: string;

  @IsInt()
  gigId: number;

  @IsInt()
  userId: number;
}
