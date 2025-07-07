import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
} from 'class-validator';

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
  @IsNumber()
  @IsNotEmpty()
  page: number = 1;

  @IsNumber()
  @IsNotEmpty()
  pageSize: number = 20;
}

export class GetUserChatsDto {
  @IsNumber()
  @IsNotEmpty()
  page: number = 1;

  @IsNumber()
  @IsNotEmpty()
  pageSize: number = 10;
}
