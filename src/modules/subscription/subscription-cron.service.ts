import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { BUY_PLAN_STATUS } from 'src/utils/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(private prismaService: PrismaService) {}

  // Run every minute
  @Cron('0 0 * * *')
  async handleExpiredSubscriptions() {
    this.logger.log('Checking for expired subscriptions...');

    try {
      const now = new Date();

      // Find all active plans that have expired
      const expiredPlans = await this.prismaService.subscriptionPlanBuy.findMany({
        where: {
          status: BUY_PLAN_STATUS.ACTIVE,
          subscription_expiry_date: { lte: now },
          OR: [
            { is_auto_debit: false },
            { transaction_id: { not: { startsWith: 'I-' } } },
            { subscription_expiry_date: { not: null } },
          ],
        },
      });

      this.logger.log(
        `Found ${expiredPlans.length} expired subscriptions to process`,
      );

      // Process each expired plan
      for (const plan of expiredPlans) {
        try {
          // Mark the expired plan as inactive
          await this.prismaService.subscriptionPlanBuy.update({
            where: { id: plan.id },
            data: {
              status: BUY_PLAN_STATUS.CANCELLED,
              updated_at: new Date(),
            },
          });

          // Find a free plan
          const freePlan = await this.prismaService.subscriptionPlan.findFirst({
            where: {
              price: 0,
            },
          });

          if (!freePlan) {
            this.logger.error('No free plan found to assign to user');
            return;
          }

          // Assign free plan to the user
          try {
            await this.prismaService.subscriptionPlanBuy.create({
              data: {
                subscription_plan_id: freePlan.id,
                user_id: plan.user_id,
                price: freePlan.price,
                status: BUY_PLAN_STATUS.ACTIVE,
                subscription_expiry_date: null,
                transaction_id: null,
              },
            });
            this.logger.log(`Assigned free plan to user ${plan.user_id}`);
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            const stack = error instanceof Error ? error.stack : undefined;
            this.logger.error(
              `Failed to assign free plan to user ${plan.user_id}: ${errorMessage}`,
              stack,
            );
          }
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          const stack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `Error processing subscription for user ${plan.user_id}: ${errorMessage}`,
            stack,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error in handleExpiredSubscriptions:', error);
    }
  }
}
