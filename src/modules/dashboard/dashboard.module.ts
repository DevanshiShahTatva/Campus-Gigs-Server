import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { GigsModule } from '../gigs/gigs.module';
import { ContactUsModule } from '../contact-us/contact-us.module';
import { GigsCategoryModule } from '../gigscategory/gigscategory.module';

@Module({
  imports:[AuthModule,UserModule,GigsModule,ContactUsModule,GigsCategoryModule],
  controllers: [DashboardController],
  providers: [DashboardService, PrismaService],
})
export class DashboardModule {}
