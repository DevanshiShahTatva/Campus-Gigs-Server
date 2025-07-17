import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RatingService } from './rating.service';
import { RatingController } from './rating.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [AuthModule, UserModule],
  controllers: [RatingController],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule { }