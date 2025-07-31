import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateBidDto } from './bids.dto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationGateway } from '../shared/notification.gateway';
import { sendUserNotification } from '../shared/notification.util';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BidsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationGateway: NotificationGateway,
    private readonly notificationsService: NotificationsService,
  ) { }
  
  async createBid(body: CreateBidDto) {
    const gigId = Number(body.gig_id);

    const gig = await this.prismaService.gigs.findUnique({
      where: { id: gigId },
      select: {
        id: true,
        title: true,
        user_id: true,
        provider_id: true,
      },
    });

    if (!gig) {
      throw new BadRequestException('Gig not found');
    }

    if (gig.provider_id) {
      throw new BadRequestException(
        'A bid has already been accepted for this gig. You cannot submit bid now.',
      );
    }

    const existingBid = await this.prismaService.bid.findFirst({
      where: {
        gig_id: gigId,
        provider_id: body.provider_id,
        is_deleted: false,
      },
    });

    if (existingBid) {
      throw new BadRequestException(
        'You have already submitted a bid for this gig',
      );
    }

    const bid = await this.prismaService.bid.create({
      data: {
        ...body,
        gig_id: gigId,
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            profile: true,
            headline: true,
            gigs_provider: {
              where: {
                is_deleted: false,
                rating: {
                  isNot: null,
                },
              },
              select: {
                rating: {
                  select: {
                    rating: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const preferences =
      await this.prismaService.notificationPreferences.findFirst({
        where: {
          user: {
            id: gig.user_id,
          },
        },
        select: {
          show_bid: true,
        },
      });

    // Only notify if user allows bid notifications
    if (preferences?.show_bid) {
      await sendUserNotification(
        this.notificationGateway,
        this.notificationsService,
        gig.user_id,
        {
          title: 'New Bid Received',
          message: `You received a new bid for your gig "${gig.title}"`,
          type: 'success',
          link: `/gigs/${gig.id}`,
        },
      );
    }

    const ratings = bid.provider.gigs_provider
      .filter((gig) => gig.rating)
      .map((gig) => gig.rating?.rating ?? 0);

    const totalReview = ratings.length;
    const avgRating =
      totalReview > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / totalReview
        : 0;

    return {
      id: bid.id,
      provider: {
        totalReview,
        id: bid.provider.id,
        name: bid.provider.name,
        profile: bid.provider.profile,
        headline: bid.provider.headline,
        avgRating: parseFloat(avgRating.toFixed(1)),
      },
      status: bid.status,
      description: bid.description,
      payment_type: bid.payment_type,
      bid_amount: bid.bid_amount,
      created_at: bid.created_at,
      updated_at: bid.updated_at,
    };
  }

  async updateBid(userId: number, bidId: number, updateData: any) {
    const bid = await this.prismaService.bid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        provider_id: true,
        status: true,
        gig_id: true,
      },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.status !== 'pending') {
      throw new BadRequestException('This bid cannot be edited as it has been accepted/rejected');
    }

    if (bid.provider_id !== userId) {
      throw new BadRequestException('You do not have permission to edit this bid');
    }

    const updatedBid = await this.prismaService.bid.update({
      where: { id: bidId },
      data: {
        ...updateData,
        gig_id: Number(updateData.gig_id),
        updated_at: new Date(),
      },
    });

    return updatedBid;
  }

  async getBidsByGigId(gigId: number) {
    const bids = await this.prismaService.bid.findMany({
      where: {
        gig_id: gigId,
        is_deleted: false,
      },
      orderBy: {
        created_at: 'desc'
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            profile: true,
            headline: true,
            gigs_provider: {
              where: {
                is_deleted: false,
                rating: {
                  isNot: null
                }
              },
              select: {
                rating: {
                  select: {
                    rating: true
                  }
                }
              }
            }
          }
        }
      }
    });

    const transformedBids = bids.map(bid => {
      const ratings = bid.provider.gigs_provider
        .filter(gig => gig.rating)
        .map(gig => gig.rating?.rating ?? 0);

      const totalReview = ratings.length;
      const avgRating = totalReview > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / totalReview
        : 0;

      return {
        id: bid.id,
        provider: {
          totalReview,
          id: bid.provider.id,
          name: bid.provider.name,
          profile: bid.provider.profile,
          headline: bid.provider.headline,
          avgRating: parseFloat(avgRating.toFixed(1)),
        },
        status: bid.status,
        description: bid.description,
        payment_type: bid.payment_type,
        bid_amount: bid.bid_amount,
        created_at: bid.created_at,
        updated_at: bid.updated_at
      };
    });

    return transformedBids;
  }

  async acceptBid(userId: number, bidId: number) {
    const bid = await this.prismaService.bid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        provider_id: true,
        gig_id: true,
        gig: {
          select: {
            id: true,
            user_id: true,
            is_deleted: true,
          },
        },
      },
    });
  
    if (!bid || !bid.gig || bid.gig.is_deleted) {
      throw new BadRequestException('Bid or Gig not found.');
    }
  
    if (bid.gig.user_id !== userId) {
      throw new BadRequestException('You do not have permission to accept this bid.');
    }
  
    const alreadyAccepted = await this.prismaService.bid.findFirst({
      where: {
        gig_id: bid.gig_id,
        status: 'accepted',
        is_deleted: false,
      },
      select: { id: true },
    });
  
    if (alreadyAccepted) {
      throw new BadRequestException('A bid for this gig has already been accepted.');
    }
  
    const updatedBid = await this.prismaService.bid.update({
      where: { id: bidId },
      data: {
        status: 'accepted',
        updated_at: new Date(),
      },
      include: {
        provider: {
          select: { id: true }
        }
      }
    });
  
    const preferences = await this.prismaService.notificationPreferences.findFirst({
      where: {
        user: {
          id: updatedBid.provider.id,
        },
      },
      select: {
        show_bid: true,
      },
    });
  
    // Notify provider (bidder) that their bid was accepted
    if (preferences?.show_bid) {
      await sendUserNotification(
        this.notificationGateway,
        this.notificationsService,
        updatedBid.provider.id,
        {
          title: 'Bid Accepted',
          message: 'Your bid was accepted!',
          type: 'success',
          link: `/gigs/${bid.gig.id}`,
        },
      );
    }
    await this.prismaService.gigs.update({
      where: { id: bid.gig_id },
      data: {
        provider_id: bid.provider_id,
      },
    });
  
    return updatedBid;
  }  

  async rejectBid(userId: number, bidId: number) {
    const bid = await this.prismaService.bid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        gig_id: true,
        status: true,
        provider_id: true,
      },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    const gig = await this.prismaService.gigs.findFirst({
      where: {
        id: bid.gig_id,
        user_id: userId,
        is_deleted: false,
      },
    });

    if (!gig) {
      throw new BadRequestException('You do not have permission to reject this bid');
    }

    if (bid.status !== 'pending') {
      throw new BadRequestException('This bid cannot be rejected as it is already processed');
    }

    const updatedBid = await this.prismaService.bid.update({
      where: { id: bidId },
      data: {
        status: 'rejected',
        updated_at: new Date(),
      },
    });

    // Notify provider (bidder) that their bid was rejected
    await sendUserNotification(
      this.notificationGateway,
      this.notificationsService,
      bid.provider_id,
      {
        title: 'Bid Rejected',
        message: 'Your bid was rejected.',
        type: 'error',
        link: `/gigs/${bid.gig_id}`
      }
    );

    return updatedBid;
  }

  async deleteBid(userId: number, bidId: number) {
    const bid = await this.prismaService.bid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        provider_id: true,
        status: true,
        is_deleted: true,
      },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.provider_id !== userId) {
      throw new BadRequestException('You do not have permission to delete this bid');
    }

    if (bid.is_deleted) {
      throw new BadRequestException('This bid is already deleted');
    }

    const updatedBid = await this.prismaService.bid.update({
      where: { id: bidId },
      data: {
        is_deleted: true,
        updated_at: new Date(),
      },
    });

    return updatedBid;
  }
}