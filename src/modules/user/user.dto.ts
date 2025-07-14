import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ROLE, PROFILE_TYPE } from 'src/utils/enums';

export class SignupDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsEnum(ROLE)
  role: ROLE;

  @IsOptional()
  @IsEnum(PROFILE_TYPE)
  profile_type?: PROFILE_TYPE;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'You must agreed the terms and conditions' })
  is_agreed: boolean;

  @IsOptional()
  @IsString()
  profile?: string;

  @IsOptional()
  @IsString()
  professional_interests: string;

  @IsOptional()
  @IsString()
  extracurriculars: string;

  @IsOptional()
  @IsString()
  certifications: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills: string[];

  @IsOptional()
  @IsString()
  education: string;

  @IsOptional()
  @IsNumber()
  otp: string;

  @IsOptional()
  @IsNumber()
  otp_expiry: string;
}

export class UserQueryParamsDto {
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

  @IsOptional()
  @IsString()
  search: string;

  @IsOptional()
  @IsString()
  sortKey: string = "name";

  @IsOptional()
  @IsEnum(["asc", "desc"])
  sortOrder: string = "desc";
}