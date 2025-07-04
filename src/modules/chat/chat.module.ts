import { Module, forwardRef } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UserModule } from '../user/user.module';
import { UserService } from '../user/user.service';
import { AuthModule } from '../auth/auth.module';
import { ChatGateway } from './gateways/chat.gateway';
import { WsJwtAuthGuard } from '../../common/guards/ws-jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => UserModule),
    forwardRef(() => AuthModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGateway,
    {
      provide: WsJwtAuthGuard,
      useFactory: (jwtService: JwtService, userService: UserService) => {
        return new WsJwtAuthGuard(jwtService, userService);
      },
      inject: [JwtService, UserService],
    },
    // Make sure to provide JwtService if not already provided by AuthModule
    JwtService,
  ],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
