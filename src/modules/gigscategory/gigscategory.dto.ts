import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, IsArray, IsNotEmpty, ArrayNotEmpty } from 'class-validator';

export class GigsCategoryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  description?: string;

  @IsNumber()
  @Transform(({ value }) => Number(value))
  tire_id: number;

  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  skillIds: number[];
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


export class GigsCategoryQueryParams extends PaginationParams {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn(
    [
      'name',
      'tire',
    ],
    {
      message: 'Invalid sort field',
    },
  )
  sortKey: string = 'name';

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'], {
    message: 'Sort order must be either asc or desc',
  })
  sortOrder: 'asc' | 'desc' = 'desc';
}
