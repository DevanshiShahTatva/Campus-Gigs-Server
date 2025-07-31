import {
  MiddlewareConsumer,
  Module,
  NestModule,
  forwardRef,
} from '@nestjs/common';
import { AppService } from './app.service';
import { v2 as cloudinary } from "cloudinary";

// Controllers
import { AppController } from './app.controller';

// modules
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContactUsModule } from './modules/contact-us/contact-us.module';
import { ProfileModule } from './modules/profile/profile.module';
import { FaqModule } from './modules/faqs/faq.module';
import { TermsModule } from './modules/terms/terms.module';
import { PrivacyPolicyModule } from './modules/privacy-policy/privacy-policy.module';
import { BadgeModule } from './modules/badge/badge.module';
import { SubscriptionCronModule } from './modules/subscription/subscription-cron.module';
import { SubscriptionPlanModule } from './modules/subscription-plan/subscription-plan.module';
import { TireModule } from './modules/tire/tire.module';
import { BuyPlanModule } from './modules/buy-plan/buy-plan.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

// middleware
import { LoggingMiddleware } from './common/middlewares/logging.middleware';

// configs
import { ConfigModule, ConfigService } from '@nestjs/config';

// helpers
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { MailerModule } from '@nestjs-modules/mailer';
import { SeedingModule } from './modules/seeder/seeding.module';
import { GigsCategoryModule } from './modules/gigscategory/gigscategory.module';
import { GigsModule } from './modules/gigs/gigs.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ChatModule } from './modules/chat/chat.module';
import { BidsModule } from './modules/bids/bids.module';
import { SkillsModule } from './modules/skills/skills.module';
import { NotificationGateway } from './modules/shared/notification.gateway';
import { ChatGateway } from './modules/chat/gateways/chat.gateway';
import { PaypalModule } from './modules/paypal/paypal.module';
import { RatingModule } from './modules/rating/rating.module';
import { PaymentHistoryModule } from './modules/paymentHistory/paymentHistory.module';
import { StripeModule } from './modules/stripe/stripe.module';
import { GigNotificationModule } from './modules/gig-notification/gig-notification.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CloudinaryModule } from './modules/cloudinary/cloudinary.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    // WebSocket module is configured in individual gateways
    // Core modules
    PrismaModule,

    // Auth and User related modules (with circular deps)
    forwardRef(() => AuthModule),
    UserModule,

    // Subscription related modules (with circular deps)
    forwardRef(() => SubscriptionPlanModule),
    forwardRef(() => BuyPlanModule),

    // Other feature modules
    SubscriptionCronModule,
    ContactUsModule,
    ProfileModule,
    FaqModule,
    TermsModule,
    PrivacyPolicyModule,
    BadgeModule,
    TireModule,
    NotificationsModule,
    RatingModule,

    // Third-party modules
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60, limit: 120 }],
    }),
    EventEmitterModule.forRoot({
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (config: ConfigService) => ({
        transport: {
          host: config.get<string>('SMTP_HOST'),
          port: config.get<number>('SMTP_PORT'),
          auth: {
            user: config.get<string>('EMAIL_USER'),
            pass: config.get<string>('EMAIL_PASS'),
          },
        },
        defaults: {
          from: `"Campusgigs" <${config.get<string>('EMAIL_USER')}>`,
        },
      }),
      inject: [ConfigService],
    }),

    // App modules
    UserModule,
    AuthModule,
    ChatModule, // This contains our ChatGateway
    SubscriptionPlanModule,
    ContactUsModule,
    FaqModule,
    TermsModule,
    TireModule,
    SeedingModule,
    ChatModule,
    PrivacyPolicyModule,
    GigsCategoryModule,
    BidsModule,
    GigNotificationModule,
    SkillsModule,
    GigsModule,
    PaypalModule,
    PaymentHistoryModule,
    DashboardModule,
    StripeModule,
    CloudinaryModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    NotificationGateway,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    ChatGateway,
    {
      provide: "Cloudinary",
      useFactory: () => {
        return cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });
      },
    }
  ],
})
export class AppModule implements NestModule {
  constructor() {}

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
