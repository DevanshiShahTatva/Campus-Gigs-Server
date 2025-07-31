import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { subMonths, startOfMonth, endOfMonth, subDays, format, eachMonthOfInterval, subYears, eachYearOfInterval } from 'date-fns';
import { CONTACT_US_STATUS } from 'src/utils/enums';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) { }

  async getSummary() {
    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);
    const startOfLastMonth = startOfMonth(subMonths(now, 1));
    const endOfLastMonth = endOfMonth(subMonths(now, 1));

    const [
      totalUsers,
      bannedUsers,
      currentMonthUsers,
      lastMonthUsers,
      totalGigs,
      currentMonthGigCount,
      lastMonthGigCount,
      totalComplaints,
      pendingCount,
      respondedCount,
      gigsByCategory,
      totalRevenue,
      currentMonthRevenue,
      lastMonthRevenue,
      topRatedUsersRaw,
      usersByPlan,
      complaintsByOutcome,
      subscriptionPlan
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'user' } }),
      this.prisma.user.count({ where: { role: 'user', is_banned: true } }),
      this.prisma.user.count({
        where: {
          role: 'user',
          created_at: {
            gte: startOfCurrentMonth,
            lte: endOfCurrentMonth,
          },
        },
      }),
      this.prisma.user.count({
        where: {
          role: 'user',
          created_at: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      this.prisma.gigs.count(),
      this.prisma.gigs.count({
        where: {
          created_at: {
            gte: startOfCurrentMonth,
            lte: endOfCurrentMonth,
          },
        },
      }),
      this.prisma.gigs.count({
        where: {
          created_at: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      this.prisma.contactUs.count(),
      this.prisma.contactUs.count({
        where: { status: CONTACT_US_STATUS.PENDING },
      }),
      this.prisma.contactUs.count({
        where: { status: CONTACT_US_STATUS.RESPONDED },
      }),
      this.prisma.gigs.groupBy({
        by: ['gig_category_id'],
        _count: { gig_category_id: true },
      }),
      this.prisma.paymentHistory.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          type: 'subscription',
          is_deleted: false,
        }
      }),
      this.prisma.paymentHistory.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          type: 'subscription',
          is_deleted: false,
          paid_at: {
            gte: startOfCurrentMonth,
            lte: endOfCurrentMonth,
          },
        },
      }),
      this.prisma.paymentHistory.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          type: 'subscription',
          is_deleted: false,
          paid_at: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      this.prisma.rating.groupBy({
        by: ['created_by_id'],
        where: {
          is_deleted: false,
          created_by_id: { not: null },
        },
        _avg: { rating: true },
        _count: { rating: true },
        orderBy: { _avg: { rating: 'desc' } },
        take: 5,
      }),
      this.prisma.snapshotSubscriptionPlan.findMany({
        where: {
          base_plan_id: { not: null },
        },
        select: {
          base_plan_id: true,
          name: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.complaint.groupBy({
        by: ['outcome'],
        _count: {
          _all: true,
        },
        where: {
          is_deleted: false,
        },
      }),
      this.prisma.subscriptionPlan.findMany({
        select: {
          id: true,
          name: true
        }
      }),
    ]);

    const percentageIncrease =
      lastMonthUsers === 0
        ? currentMonthUsers > 0 ? 100 : 0
        : ((currentMonthUsers - lastMonthUsers) / lastMonthUsers) * 100;

    const percentageIncreaseGigs =
      lastMonthGigCount === 0
        ? currentMonthGigCount > 0 ? 100 : 0
        : ((currentMonthGigCount - lastMonthGigCount) / lastMonthGigCount) * 100;

    const currentRevenue = currentMonthRevenue._sum.amount || 0;
    const lastRevenue = lastMonthRevenue._sum.amount || 0;

    const percentageIncreaseRevenue = lastRevenue === 0
      ? currentRevenue > 0 ? 100 : 0
      : ((currentRevenue - lastRevenue) / lastRevenue) * 100;

    const categoryIds = gigsByCategory.map((g) => g.gig_category_id);

    const categories = await this.prisma.gigsCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    const gigsByCategories = gigsByCategory
      .map((g) => ({
        categoryId: g.gig_category_id,
        categoryName: categoryMap.get(g.gig_category_id) || 'Unknown',
        count: g._count.gig_category_id,
      }))
      .sort((a, b) => b.count - a.count);;

    const bannedUserPercentage = totalUsers > 0
      ? (bannedUsers / totalUsers) * 100
      : 0;

    const topRatedUsers = await Promise.all(
      topRatedUsersRaw.map(async (entry) => {
        const user = await this.prisma.user.findUnique({
          where: { id: entry.created_by_id! },
          select: { name: true, email: true },
        });
        return {
          name: user?.name || '',
          email: user?.email || '',
          average_rating: Number(entry._avg.rating?.toFixed(2)),
          total_ratings: entry._count.rating,
        };
      })
    );

    const groupedUsers = usersByPlan.reduce((acc, item) => {
      if (!item.base_plan_id) return acc;

      if (!acc[item.base_plan_id]) {
        acc[item.base_plan_id] = {
          planName: item.name,
          users: [],
        };
      }
      acc[item.base_plan_id].users.push(item.user);
      return acc;
    }, {} as Record<number, { planName: string; users: { id: number; name: string; email: string }[] }>);

    const usersByPlanWithDetails = subscriptionPlan.map(plan => {
      const matched = groupedUsers[plan.id];
      return {
        planId: plan.id,
        planName: plan.name,
        userCount: matched ? matched.users.length : 0,
        users: matched ? matched.users : [],
      };
    }).sort((a, b) => b.userCount - a.userCount);


    const outcomeCounts = {
      pending: 0,
      resolved: 0,
      underReview: 0
    };

    for (const item of complaintsByOutcome) {
      const count = item._count._all;
      switch (item.outcome) {
        case 'pending':
          outcomeCounts.pending += count;
          break;
        case 'provider_won':
        case 'user_won':
          outcomeCounts.resolved += count;
          break;
        case 'under_review':
          outcomeCounts.underReview += count;
          break;
      }
    }

    return {
      totalUsers,
      percentageIncrease: +percentageIncrease.toFixed(2),
      bannedUsers,
      bannedUserPercentage: +bannedUserPercentage.toFixed(2),
      totalGigs,
      percentageIncreaseGigs: +percentageIncreaseGigs.toFixed(2),
      totalComplaints,
      pendingComplaintsCount: pendingCount,
      respondedComplaintsCount: respondedCount,
      gigsByCategories,
      totalRevenue: totalRevenue._sum.amount || 0,
      percentageIncreaseRevenue: +percentageIncreaseRevenue.toFixed(2),
      topRatedUsers,
      usersByPlan: usersByPlanWithDetails,
      complaintsByOutcome: outcomeCounts,
      subscriptionPlan: subscriptionPlan
    };
  }

  async getRevenueOverview(range: string) {
    const now = new Date();
    let start: Date;
    let timeUnits: Date[];
    let groupFormat: string;
    let labelFormat: string;

    if (range === '12_months') {
      start = subMonths(now, 11);
      timeUnits = eachMonthOfInterval({ start, end: now });
      groupFormat = 'yyyy-MM';
      labelFormat = 'MMM yyyy';
    } else if (range === '7_years') {
      start = subYears(now, 6);
      timeUnits = eachYearOfInterval({ start, end: now });
      groupFormat = 'yyyy';
      labelFormat = 'yyyy';
    } else {
      start = subDays(now, 6);
      timeUnits = Array.from({ length: 7 }).map((_, i) => subDays(now, 6 - i));
      groupFormat = 'yyyy-MM-dd';
      labelFormat = 'dd-MM EEE';
    }

    const data = await this.prisma.paymentHistory.findMany({
      where: {
        type: 'subscription',
        is_deleted: false,
        paid_at: {
          gte: start,
          lte: now,
        },
      },
      select: {
        paid_at: true,
        amount: true,
      },
    });


    const revenueMap: Record<string, number> = {};
    timeUnits.forEach((date) => {
      const key = format(date, groupFormat);
      revenueMap[key] = 0;
    });


    data.forEach(({ paid_at, amount }) => {
      const key = format(paid_at, groupFormat);
      if (revenueMap[key] !== undefined) {
        revenueMap[key] += amount;
      }
    });

    const result = timeUnits.map((date) => {
      const key = format(date, groupFormat);
      const label = format(date, labelFormat);
      return {
        key,
        label,
        amount: revenueMap[key],
      };
    });

    return { success: true, data: result };
  }

}
