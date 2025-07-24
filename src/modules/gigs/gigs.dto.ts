import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { GIG_STATUS, PAYMENT_TYPE, PRIORITY, PROFILE_TYPE } from 'src/utils/enums';

export class PostGigsDto {
  @IsOptional()
  @IsNumber()
  @IsInt()
  user_id: number;
  
  @IsOptional()
  @IsNumber()
  @IsInt()
  provider_id: number;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsNumber()
  @Transform(({ value }) => Number(value))
  gig_category_id: number;

  @IsEnum(PAYMENT_TYPE)
  payment_type: PAYMENT_TYPE.FIXED;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  price: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications: string[];

  @IsEnum(PROFILE_TYPE)
  profile_type: PROFILE_TYPE.USER;

  @IsOptional()
  @IsEnum(PRIORITY)
  priority: PRIORITY.LOW;
  
  @IsArray()
  @IsOptional()
  skills: number[];

  @IsOptional()
  @IsEnum(GIG_STATUS)
  status: GIG_STATUS.UNSTARTED

  @IsDate()
  @Type(() => Date)
  start_date_time: Date;

  @IsDate()
  @Type(() => Date)
  end_date_time: Date;
}

export class ChangeGigStatusDto {
  @IsEnum(GIG_STATUS)
  status: GIG_STATUS;
}

export class ChangeGigPriorityDto {
  @IsEnum(PRIORITY)
  priority: PRIORITY;
}

export class PaginationParams {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize: number = 10;
}

export class GigsQueryParams extends PaginationParams {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(GIG_STATUS)
  status?: string;

  @IsOptional()
  @IsEnum(PROFILE_TYPE)
  profile_type?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minRating?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(PAYMENT_TYPE, { each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v: string) => v.trim());
    }
    return value;
  })
  paymentType?: PAYMENT_TYPE[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((v: string) => v.trim());
    }
    return value;
  })
  category?: (string | number)[];
}

export class GigPipelineQueryParams extends PaginationParams {
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsEnum(['pending', 'accepted', 'un_started', 'in_progress', 'completed', 'rejected'])
  status?: string;
}