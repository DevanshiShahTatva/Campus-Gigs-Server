import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { subMonths, startOfMonth, endOfMonth, startOfDay, subDays, format } from 'date-fns';
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
    const sevenDaysAgo = startOfDay(subDays(new Date(), 6));

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
      lastSevenDaysRevenue
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
      this.prisma.paymentHistory.findMany({
        where: {
          type: 'subscription',
          is_deleted: false,
          paid_at: {
            gte: sevenDaysAgo,
          },
        },
        select: {
          paid_at: true,
          amount: true,
        },
      })
    ]);

    const revenueByDate: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      revenueByDate[date] = 0;
    }

    lastSevenDaysRevenue.forEach(({ paid_at, amount }) => {
      const dateStr = format(paid_at, 'yyyy-MM-dd');
      if (revenueByDate[dateStr] !== undefined) {
        revenueByDate[dateStr] += amount;
      }
    });

    const finalSevenDaysRevenue = Object.entries(revenueByDate).map(([date, amount]) => {
      const day = format(new Date(date), 'EEE');
      return {
        date,
        day,
        amount,
      };
    });

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
      ? currentRevenue > 0 ? 100 : 0 // handle division by 0
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
      lastSevenDaysRevenue: finalSevenDaysRevenue
    };
  }
}
