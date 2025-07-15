import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';

import { MESSAGE_TYPE } from 'src/utils/enums';

export class CreateChatDto {
  @IsNumber()
  @IsNotEmpty()
  userId: number;
}

export class SendMessageDto {
  @IsString()
  @IsOptional()
  message?: string;

  @IsEnum(MESSAGE_TYPE)
  @IsOptional()
  messageType?: MESSAGE_TYPE = MESSAGE_TYPE.TEXT;

  @IsOptional()
  files?: any[]; // Will be populated by multer
}

export class GetChatMessagesDto {
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  page: number = 1;

  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  pageSize: number = 20;
}

export class GetChatDetailsDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class GetUserChatsDto {
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  page: number = 1;

  @Type(() => Number)
  @IsNotEmpty()
  pageSize: number = 10;

  @IsOptional()
  @IsString()
  search?: string;
}
