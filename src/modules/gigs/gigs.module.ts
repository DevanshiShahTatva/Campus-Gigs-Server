import { Module } from '@nestjs/common';
import { GigsController } from './gigs.controller';
import { GigsService } from './gigs.service';
import { AuthModule } from '../auth/auth.module';
import { UserFromToken } from '../shared/userFromToken.service';
import { TireModule } from '../tire/tire.module';
import { AwsS3Service } from '../shared/aws-s3.service';
import { UserModule } from '../user/user.module';
import { PublicGigsController } from './gigs.public.controller';

@Module({
  imports: [AuthModule, TireModule, UserModule],
  controllers: [GigsController, PublicGigsController],
  providers: [GigsService, UserFromToken, AwsS3Service],
  exports: [],
})
export class GigsModule {}
