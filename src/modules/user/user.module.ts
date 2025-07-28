import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { AwsS3Service } from '../shared/aws-s3.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UserController } from './user.controller';
import { AuthModule } from '../auth/auth.module';
import { BuyPlanModule } from '../buy-plan/buy-plan.module';
import { PublicPortfolioController } from './public-portfolio.controller';

@Module({
  imports: [forwardRef(() => AuthModule), BuyPlanModule, PrismaModule],
  controllers: [UserController, PublicPortfolioController ],
  providers: [UserService, AwsS3Service],
  exports: [UserService],
})
export class UserModule {}
