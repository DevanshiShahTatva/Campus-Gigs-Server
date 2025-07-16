import { Module } from '@nestjs/common';
// service
import { ContactUsService } from './contact-us.service';

// controlller
import { ContactUsController } from './contact-us.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiService } from '../shared/ai.service';
import { UserModule } from '../user/user.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationGateway } from '../shared/notification.gateway';

@Module({
  imports: [AuthModule, PrismaModule, UserModule, NotificationsModule],
  controllers: [ContactUsController],
  providers: [ContactUsService, AiService, NotificationGateway],
})
export class ContactUsModule {}
