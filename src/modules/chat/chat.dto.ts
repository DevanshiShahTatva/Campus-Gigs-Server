import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
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
  @IsNotEmpty()
  message: string;

  @IsEnum(MESSAGE_TYPE)
  @IsOptional()
  messageType: MESSAGE_TYPE = MESSAGE_TYPE.TEXT;
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

export class GetUserChatsDto {
  @Type(() => Number)
  @IsNumber()
  @IsNotEmpty()
  page: number = 1;

  @Type(() => Number)
  @IsNotEmpty()
  pageSize: number = 10;
}
