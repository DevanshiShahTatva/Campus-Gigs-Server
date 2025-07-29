import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { subMonths, startOfMonth, endOfMonth, subDays, format, eachMonthOfInterval, subYears, eachYearOfInterval } from 'date-fns';
import { OUTCOME } from '@prisma/client';

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
      complaintsByOutcome
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
      this.prisma.complaint.count(),
      this.prisma.complaint.count({
        where: { outcome: OUTCOME.pending },
      }),
      this.prisma.complaint.count({
        where: {
          outcome: {
            not: OUTCOME.pending,
          },
        },
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
      this.prisma.snapshotSubscriptionPlan.groupBy({
        by: ['base_plan_id', 'name'],
        _count: {
          user_id: true,
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
      })
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

    const usersByPlanWithDetails = usersByPlan.map((plan) => ({
      planId: plan.base_plan_id,
      planName: plan.name,
      userCount: plan._count.user_id,
    })).sort((a, b) => b.userCount - a.userCount);

    const outcomeCounts = {
      pending: 0,
      provider_won: 0,
      user_won: 0,
    };

    for (const item of complaintsByOutcome) {
      outcomeCounts[item.outcome] = item._count._all;
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
