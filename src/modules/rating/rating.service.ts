import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RatingDto } from './rating.dto';

@Injectable()
export class RatingService {
  constructor(private prismaService: PrismaService) { }

  async create(body: RatingDto, currentUserId: number) {
    const { gig_id, rating, rating_feedback, issue_text, what_provider_done } = body;

    const gig = await this.prismaService.gigs.findUnique({
      where: { id: gig_id },
      select: {
        id: true,
        status: true,
        user_id: true,
        provider_id: true,
      },
    });

    if (!gig) {
      throw new BadRequestException('Gig not found.');
    }

    if (gig.status !== 'completed') {
      throw new BadRequestException('You can only rate a gig that has been completed.');
    }

    if (gig.provider_id === currentUserId) {
      throw new BadRequestException('Provider cannot rate their own gig.');
    }

    const alreadyRated = await this.prismaService.rating.findFirst({
      where: {
        gig_id,
        created_by_id: currentUserId,
      },
    });

    if (alreadyRated) {
      throw new BadRequestException('You have already submitted a rating for this gig.');
    }

    if (rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5.');
    }

    if (rating < 4) {
      if (!issue_text?.trim()) {
        throw new BadRequestException('Issue text is required for ratings below 4.');
      }

      if (!what_provider_done?.trim()) {
        throw new BadRequestException('Provider actions are required for ratings below 4.');
      }
    }

    const createdRating = await this.prismaService.rating.create({
      data: {
        gig_id,
        rating,
        rating_feedback,
        created_by_id: currentUserId,
      },
    });

    if (rating < 4) {
      await this.prismaService.complaint.create({
        data: {
          gig_id,
          issue_text,
          what_provider_done,
          rating_id: createdRating.id,
        },
      });
    }

    return createdRating;
  }

  async getRatingAndComplaintByGigId(gigId: number) {
    const gigWithRating = await this.prismaService.gigs.findUnique({
      where: { id: gigId },
      select: {
        title: true,
        user: {
          select: {
            name: true,
          },
        },
        rating: {
          select: {
            id: true,
            rating: true,
            rating_feedback: true,
            complaint: {
              select: {
                id: true,
                issue_text: true,
                what_provider_done: true,
                created_at: true,
              },
            },
          },
        },
      },
    });

    if (!gigWithRating || !gigWithRating.rating) {
      throw new BadRequestException('Rating not found for this gig.');
    }

    const rating = gigWithRating.rating;
    const complaint = rating.complaint;

    return {
      ratingId: rating.id,
      complaintId: complaint?.id || null,
      gigTitle: gigWithRating.title,
      customerName: gigWithRating.user?.name || '',
      userRating: rating.rating,
      userFeedback: rating.rating_feedback,
      userIssue: complaint?.issue_text || '',
      userExpectation: complaint?.what_provider_done || '',
      complaintDate: complaint?.created_at || null,
    };
  }
}