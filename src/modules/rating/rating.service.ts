import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeComplaintDto, RatingDto } from './rating.dto';

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
        completed_at: true,
      },
    });

    if (!gig) {
      throw new BadRequestException('Gig not found.');
    }

    if (gig.status !== 'completed' || !gig.completed_at) {
      throw new BadRequestException('You can only rate a gig that has been completed.');
    }

    const completedTime = gig.completed_at;
    const tenMinutesAfterCompleted = new Date(completedTime.getTime() + 10 * 60 * 1000);
    const now = new Date();

    if (now > tenMinutesAfterCompleted) {
      throw new BadRequestException('Rating period has expired. You can no longer rate this gig.');
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
            created_at: true,
            rating_feedback: true,
            complaint: {
              select: {
                id: true,
                issue_text: true,
                updated_at: true,
                provider_response: true,
                what_provider_done: true
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
      complaintId: complaint?.id || null,
      gigTitle: gigWithRating.title,
      customerName: gigWithRating.user?.name || '',
      userRating: rating.rating,
      userFeedback: rating.rating_feedback,
      userIssue: complaint?.issue_text || '',
      providerResponse: complaint?.provider_response || '',
      userExpectation: complaint?.what_provider_done || '',
      ratingDate: rating.created_at || null,
      providerChallengeDate: complaint?.updated_at || null,
    };
  }

  async challengeComplaint(body: ChallengeComplaintDto, currentUserId: number) {
    const { complaint_id, provider_response } = body;

    const complaint = await this.prismaService.complaint.findUnique({
      where: { id: complaint_id },
      include: {
        gig: {
          select: {
            provider_id: true,
          },
        },
      },
    });

    if (!complaint) {
      throw new BadRequestException('Complaint not found.');
    }

    if (complaint.gig.provider_id !== currentUserId) {
      throw new BadRequestException('You are not authorised to challenge this complaint.');
    }

    if (complaint.is_challenged) {
      throw new BadRequestException('This complaint has already been challenged.');
    }

    await this.prismaService.complaint.update({
      where: { id: complaint_id },
      data: {
        provider_response,
        is_challenged: true,
      },
    });

    return {
      message: 'Complaint challenged successfully.',
    };
  }
}