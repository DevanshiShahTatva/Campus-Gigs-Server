import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateBidDto } from './bids.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BidsService {
  constructor(
    private readonly prismaService: PrismaService,
  ) { }

  async createBid(body: CreateBidDto) {
    const existingBid = await this.prismaService.bid.findFirst({
      where: {
        gig_id: Number(body.gig_id),
        provider_id: body.provider_id,
        is_deleted: false,
      },
    });

    if (existingBid) {
      throw new BadRequestException('You have already submitted a bid for this gig');
    }

    const bid = await this.prismaService.bid.create({
      data: {
        ...body,
        gig_id: Number(body.gig_id),
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            profile: true,
            professional_interests: true,
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
        id: bid.provider.id,
        name: bid.provider.name,
        profile: bid.provider.profile,
        avgRating: parseFloat(avgRating.toFixed(1)),
        totalReview,
        about: bid.provider.professional_interests,
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
            professional_interests: true,
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
          id: bid.provider.id,
          name: bid.provider.name,
          profile: bid.provider.profile,
          avgRating: parseFloat(avgRating.toFixed(1)),
          totalReview,
          about: bid.provider.professional_interests
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
    const gig = await this.prismaService.gigs.findFirst({
      where: {
        id: {
          in: await this.prismaService.bid.findUnique({
            where: { id: bidId },
            select: { gig_id: true }
          }).then(bid => bid?.gig_id ? [bid.gig_id] : []),
        },
        user_id: userId,
        is_deleted: false,
      },
      select: {
        id: true,
        user_id: true,
      },
    });

    if (!gig) {
      throw new BadRequestException('You do not have permission to accept this bid');
    }

    const updatedBid = await this.prismaService.bid.update({
      where: { id: bidId },
      data: {
        status: 'accepted',
        updated_at: new Date(),
      },
    });

    return updatedBid;
  }
}