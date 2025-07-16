import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class BuyPlanDto {
  @IsOptional()
  @IsBoolean()
  isAutoDebit: boolean = false;

  @IsOptional()
  @IsString()
  auto_deduct_id: string;
}
