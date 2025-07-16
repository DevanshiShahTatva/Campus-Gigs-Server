import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { PaypalService } from '../../shared/paypal.service';

import { BY_PLAN_STATUS } from '@prisma/client';
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
    }

    // Check if user already has an active plan
    const existingPlan = await this.prismaService.subscriptionPlanBuy.findFirst(
      {
        where: {
          user_id: userId,
          subscription_plan_id: planId,
          status: BY_PLAN_STATUS.active,
          subscription_expiry_date: {
            gte: new Date(),
          },
        },
      },
    );

    if (existingPlan) {
      throw new ConflictException('User already has an active plan');
    }

    // If it's a free plan, activate it immediately
    if (subscriptionPlan.price === 0) {
      return this.activatePlan(userId, planId);
    }

    return new BadRequestException('Cannot create free plan: Plan is not free');
  }

  async buyPaidPlan(
  subscriptionPlanId: number,
  orderId: string,
  body: BuyPlanDto,
  userId: number,
) {
  // Start a transaction to ensure data consistency
  return await this.prismaService.$transaction(async (prisma) => {
    try {
      // 1. First, verify the subscription plan exists
      const subscriptionPlan = await prisma.subscriptionPlan.findUnique({
        where: { id: subscriptionPlanId },
      });

      if (!subscriptionPlan) {
        return new NotFoundException('Subscription plan not found');
      }

      // Ensure the price is a valid number
      const price = parseFloat(String(subscriptionPlan.price));
      if (isNaN(price)) {
        return new BadRequestException('Invalid price for subscription plan');
      }

      // 2. Capture the payment with PayPal only if NOT auto debit
      let capture: any = null;
      if (!body.isAutoDebit) {
        const { data: captureData } = await this.paypalService.captureOrder(orderId);
        if (!captureData?.id) {
          return new BadRequestException('Failed to capture payment');
        }
        capture = captureData;
      }

      // 3. Find and cancel any existing active plan
      const existingActivePlan = await prisma.subscriptionPlanBuy.findFirst({
        where: {
          user_id: userId,
          status: BY_PLAN_STATUS.active,
        },
      });

      // 4. Cancel existing active plan if exists
      if (existingActivePlan) {
        await prisma.subscriptionPlanBuy.update({
          where: { id: existingActivePlan.id },
          data: {
            status: BY_PLAN_STATUS.cancelled,
            subscription_expiry_date: new Date(),
          },
        });
      }

      // 5. Create and activate the new plan
      const newPlan = await prisma.subscriptionPlanBuy.create({
        data: {
          user_id: userId,
          subscription_plan_id: subscriptionPlanId,
          status: BY_PLAN_STATUS.active,
          price: price,
          transaction_id: body.isAutoDebit ? body.auto_deduct_id : capture.id,
          subscription_expiry_date: body.isAutoDebit ? null : (() => {
            const now = new Date();
            const expiry = new Date(now);
            expiry.setMonth(expiry.getMonth() + 1);
            return expiry;
          })(),
        },
        include: {
          subscription_plan: true,
        },
      });

      return newPlan;
    } catch (error) {
      return new BadRequestException('Failed to buy paid plan');
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

  async getPlanHistory(userId: number) {
    return this.prismaService.subscriptionPlanBuy.findMany({
      where: { user_id: userId },
      include: { subscription_plan: true },
      orderBy: { created_at: 'desc' },
    });
  }
}
