import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { PaypalService } from '../../shared/paypal.service';

import { BY_PLAN_STATUS, PAYMENT_HISTORY_TYPE } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BuyPlanDto } from './dto/buy-plan.dto';

@Injectable()
export class BuyPlanService {
  constructor(
    private prismaService: PrismaService,
    @Inject(PaypalService)
    private readonly paypalService: PaypalService,
  ) {}

  async createFreePlan(
    createBuyPlanDto: { subscription_plan_id: number },
    userId: number,
  ) {
    const planId = createBuyPlanDto.subscription_plan_id;
    // Check if user exists
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if subscription plan exists
    const subscriptionPlan =
      await this.prismaService.subscriptionPlan.findUnique({
        where: { id: planId },
      });

    if (!subscriptionPlan) {
      throw new NotFoundException('Subscription plan not found');
    };

    const subscription_data_snapshot = {
      user_id: userId,
      base_plan_id: subscriptionPlan.id,
      name: subscriptionPlan.name,
      description: subscriptionPlan.description,
      price: subscriptionPlan.price,
      is_pro: subscriptionPlan.is_pro,
      roles_allowed: subscriptionPlan.roles_allowed,
      max_bid_per_month: subscriptionPlan.max_bid_per_month,
      max_gig_per_month: subscriptionPlan.max_gig_per_month,
      features: subscriptionPlan.features,
      can_get_badge: subscriptionPlan.can_get_badge,
      most_popular: subscriptionPlan.most_popular,
      button_text: subscriptionPlan.button_text,
      icon: subscriptionPlan.icon,
      paypal_product_id: subscriptionPlan.paypal_product_id,
      paypal_plan_id: subscriptionPlan.paypal_plan_id,
    };

    // Check if user already has an active plan
    const existingPlan = await this.prismaService.subscriptionPlanBuy.findFirst({
      where: {
        user_id: userId,
        status: BY_PLAN_STATUS.active,
        subscription_expiry_date: {
          gte: new Date(),
        },
      },
    });

    if (existingPlan) {
      throw new ConflictException('User already has an active plan');
    };

    // 4. If it's a free plan, activate it and snapshot it
    if (subscriptionPlan.price === 0) {
      return this.prismaService.$transaction(async (tx) => {
        // Create snapshot from subscription plan
        const snapshot = await tx.snapshotSubscriptionPlan.create({
          data: subscription_data_snapshot
        });

        const newFreePlan = await tx.subscriptionPlanBuy.create({
          data: {
            user_id: userId,
            subscription_plan_id: snapshot.id,
            transaction_id: null,
            status: BY_PLAN_STATUS.active,
            is_auto_debit: false,
            subscription_expiry_date: (() => {
              const now = new Date();
              const expiry = new Date(now);
              expiry.setMonth(expiry.getMonth() + 1);
              return expiry;
            })(),
          }
        });

        return newFreePlan;
      });
    }

    return new BadRequestException('Cannot create free plan: Plan is not free');
  }

  async buyPaidPlan(
    subscriptionPlanId: number,
    orderId: string,
    body: BuyPlanDto,
    userId: number,
  ) {
    return await this.prismaService.$transaction(async (prisma) => {
      try {
        // 1. Fetch original subscription plan
        const subscriptionPlan = await prisma.subscriptionPlan.findUnique({
          where: { id: subscriptionPlanId },
        });

        if (!subscriptionPlan) {
          throw new NotFoundException('Subscription plan not found');
        }

        const price = parseFloat(String(subscriptionPlan.price));
        if (isNaN(price)) {
          throw new BadRequestException('Invalid price for subscription plan');
        }

        // 2. Capture payment from PayPal (if not auto-debit)
        let capture: any = null;
        if (!body.isAutoDebit) {
          const { data: captureData } = await this.paypalService.captureOrder(orderId);
          if (!captureData?.id) {
            throw new BadRequestException('Failed to capture payment');
          }
          capture = captureData;
        }

        // 3. Cancel existing active plan
        const existingActivePlan = await prisma.subscriptionPlanBuy.findFirst({
          where: {
            user_id: userId,
            status: BY_PLAN_STATUS.active,
          },
        });

        if (existingActivePlan) {
          if (existingActivePlan.is_auto_debit && existingActivePlan.transaction_id) {
            await this.paypalService.cancelSubscription(existingActivePlan.transaction_id);
          }

          await prisma.subscriptionPlanBuy.update({
            where: { id: existingActivePlan.id },
            data: {
              status: BY_PLAN_STATUS.cancelled,
              is_auto_debit: false,
              subscription_expiry_date: new Date(),
            },
          });
        }

        // 4. Create a snapshot in snapshotSubscriptionPlan
        // create new one
        const boughtPlanSnapshot = await prisma.snapshotSubscriptionPlan.create({
          data: {
            user_id: userId,
            base_plan_id: subscriptionPlan.id,
            name: subscriptionPlan.name,
            description: subscriptionPlan.description,
            price: subscriptionPlan.price,
            is_pro: subscriptionPlan.is_pro,
            roles_allowed: subscriptionPlan.roles_allowed,
            max_bid_per_month: subscriptionPlan.max_bid_per_month,
            max_gig_per_month: subscriptionPlan.max_gig_per_month,
            features: subscriptionPlan.features,
            can_get_badge: subscriptionPlan.can_get_badge,
            most_popular: subscriptionPlan.most_popular,
            button_text: subscriptionPlan.button_text,
            icon: subscriptionPlan.icon,
            paypal_product_id: subscriptionPlan.paypal_product_id,
            paypal_plan_id: subscriptionPlan.paypal_plan_id,
          },
        });

        // 5. Create the SubscriptionPlanBuy linked to the snapshot
        const now = new Date();
        const newPlan = await prisma.subscriptionPlanBuy.create({
          data: {
            user_id: userId,
            subscription_plan_id: boughtPlanSnapshot.id,
            price: price,
            transaction_id: body.isAutoDebit ? body.auto_deduct_id : capture.id,
            is_auto_debit: body.isAutoDebit,
            status: BY_PLAN_STATUS.active,
            subscription_expiry_date: body.isAutoDebit
              ? null
              : new Date(new Date().setMonth(now.getMonth() + 1)),
          },
          include: {
            subscription_plan: true, // optional if you want full snapshot returned
          },
        });

        // 6. Save payment history
        await prisma.paymentHistory.create({
          data: {
            user_id: userId,
            transaction_id: body.isAutoDebit ? body.auto_deduct_id : capture.id,
            type: PAYMENT_HISTORY_TYPE.subscription,
            description: "Payment successfully paid for subscription.",
            amount: price,
            paid_at: new Date(),
          },
        });

        return newPlan;
      } catch (error) {
        console.error('[buyPaidPlan]', error);
        throw new BadRequestException('Failed to buy paid plan');
      }
    });
  }


  private async activatePlan(userId: number, planId: number) {
    // Verify the plan exists and get its details
    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return new NotFoundException('Plan not found');
    }

    return this.prismaService.subscriptionPlanBuy.create({
      data: {
        user_id: userId,
        subscription_plan_id: planId,
        status: BY_PLAN_STATUS.active,
        subscription_expiry_date: new Date(
          new Date().setFullYear(new Date().getFullYear() + 1),
        ),
        price: plan.price,
      },
      include: {
        subscription_plan: true,
      },
    });
  }

  async cancelPlan(id: number, userId: number): Promise<void> {
    const plan = await this.prismaService.subscriptionPlanBuy.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.user_id !== userId) {
      throw new UnauthorizedException('Not authorized to cancel this plan');
    }

    await this.prismaService.subscriptionPlanBuy.update({
      where: { id },
      data: {
        status: BY_PLAN_STATUS.cancelled,
        subscription_expiry_date: new Date(),
      },
    });
  }

  async findActivePlan(userId: number) {
    return this.prismaService.subscriptionPlanBuy.findFirst({
      where: {
        user_id: userId,
        status: BY_PLAN_STATUS.active,
        subscription_expiry_date: {
          gte: new Date(),
        },
      },
      include: {
        subscription_plan: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async createOrder(subscriptionPlanId: number) {
    // Verify the subscription plan exists
    const subscriptionPlan =
      await this.prismaService.subscriptionPlan.findUnique({
        where: { id: subscriptionPlanId },
      });

    if (!subscriptionPlan) {
      return new NotFoundException('Subscription plan not found');
    }

    const { data: order } = await this.paypalService.createOrder(
      subscriptionPlan.price.toString(),
    );

    if (!order?.id) {
      return new BadRequestException('Failed to create PayPal order');
    }

    return {
      orderId: order.id,
    };
  }

  async createSubscriptionSession(subscriptionPlanId: number) {
    const plan = await this.prismaService.subscriptionPlan.findUnique({
      where: { id: subscriptionPlanId },
    });
    
    if (!plan) throw new NotFoundException('Plan not found');

    const subscription =
      await this.paypalService.createSubscriptionSession(plan);

    const approvalLink = subscription.links.find(
      (link) => link.rel === 'approve',
    )?.href;

    return {
      subscriptionId: subscription.id,
      approvalLink,
    };
  }

  async cancelAutoDebit(subscriptionId: string, userId: number) {
    const plan = await this.prismaService.subscriptionPlanBuy.findFirst({
      where: {
        transaction_id: subscriptionId,
        user_id: userId,
        status: BY_PLAN_STATUS.active,
      },
    });

    if (!plan) {
      throw new NotFoundException('Active subscription not found');
    }

    const isCancelled = await this.paypalService.cancelSubscription(subscriptionId);

    if (!isCancelled) {
      throw new BadRequestException('Failed to cancel subscription on PayPal');
    }

    // Optional: mark in DB as cancelled immediately
    await this.prismaService.subscriptionPlanBuy.update({
      where: { id: plan.id },
      data: {
        is_auto_debit: false,
        subscription_expiry_date: (() => {
            const now = new Date(plan.created_at);
            const expiry = new Date(now);
            expiry.setMonth(expiry.getMonth() + 1);
            return expiry;
          })(),
      },
    });

    return { message: 'Subscription cancelled successfully' };
  }

  async getPlanHistory(userId: number) {
    return this.prismaService.subscriptionPlanBuy.findMany({
      where: { user_id: userId },
      include: { subscription_plan: true },
      orderBy: { created_at: 'desc' },
    });
  }
}
