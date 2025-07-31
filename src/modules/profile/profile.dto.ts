import { IsArray, IsOptional, IsString, IsEnum } from 'class-validator';
import { PROFILE_TYPE } from 'src/utils/enums';

export class ProfileUpdateDto {
  @IsOptional()
  @IsString()
  name?: string;

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
  @IsString()
  phone_number: string;

  @IsOptional()
  @IsString()
  location: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsEnum(PROFILE_TYPE)
  profile_type?: PROFILE_TYPE;
}
