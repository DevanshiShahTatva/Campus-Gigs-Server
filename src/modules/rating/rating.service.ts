import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeComplaintDto, DeputeQueryParams, RatingDto, ResolveDeputeGigDto } from './rating.dto';

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

    if (rating < 3) {
      if (!issue_text?.trim()) {
        throw new BadRequestException('Issue text is required for ratings below 3.');
      }

      if (!what_provider_done?.trim()) {
        throw new BadRequestException('Provider actions are required for ratings below 3.');
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

    if (rating < 3) {
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

  async getAllDeputeGigs(query: DeputeQueryParams) {
    let { status, page, pageSize, search, sortBy, sortOrder } = query;
    const skip = (page - 1) * pageSize;

    const whereClause: any = {
      is_deleted: false,
      rating: {
        rating: { lt: 4 },
        is_deleted: false,
      },
    };

    if (status === "pending") {
      whereClause.outcome = "pending";
      whereClause.is_challenged = true;
    } else if (status === "under_review") {
      whereClause.outcome = "under_review";
      whereClause.is_challenged = true;
    } else if (status === "resolved") {
      whereClause.outcome = { in: ["provider_won", "user_won"] };
      whereClause.is_challenged = true;
    }

    if (search) {
      whereClause.OR = [
        { gig: { title: { contains: search, mode: 'insensitive' } } },
        { gig: { user: { name: { contains: search, mode: 'insensitive' } } } },
        { gig: { provider: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const sortFieldMap: Record<string, any> = {
      id: { id: sortOrder },
      gigTitle: { gig: { title: sortOrder } },
      userName: { gig: { user: { name: sortOrder } } },
      providerName: { gig: { provider: { name: sortOrder } } },
      rating: { rating: { rating: sortOrder } },
      status: { outcome: sortOrder },
      complaintDate: { created_at: sortOrder },
    };

    const orderBy = sortBy && sortFieldMap[sortBy] ? sortFieldMap[sortBy] : { created_at: 'desc' };

    const [complaints, totalCount] = await this.prismaService.$transaction([
      this.prismaService.complaint.findMany({
        skip,
        take: pageSize,
        where: whereClause,
        orderBy,
        include: {
          gig: {
            include: {
              user: true,
              provider: true,
            },
          },
          rating: {
            include: {
              user: true,
            },
          },
        },
      }),
      this.prismaService.complaint.count({ where: whereClause }),
    ]);

    const data = complaints.map((complaint) => ({
      id: complaint.id.toString(),
      gigId: complaint.gig_id.toString(),
      gigTitle: complaint.gig.title,
      userId: complaint.gig.user_id.toString(),
      userImage: complaint.gig.user?.profile || "",
      userName: complaint.gig.user?.name || "",
      providerId: complaint.gig.provider_id?.toString() || "",
      providerName: complaint.gig.provider?.name || "",
      providerImage: complaint.gig.provider?.profile || "",
      rating: complaint.rating.rating,
      complaintDate: complaint.created_at.toISOString(),
      userFeedback: complaint.rating.rating_feedback,
      userIssue: complaint.issue_text || "",
      userExpectation: complaint.what_provider_done || "",
      providerResponse: complaint.provider_response || "",
      lastActivity: complaint.updated_at.toISOString(),
      adminNotes: complaint.admin_feedback || "",
      decision: complaint.outcome,
      status:
        complaint.outcome === "pending"
          ? "pending"
          : complaint.outcome === "under_review"
            ? "under_review"
            : "resolved",
      resolvedAt:
        complaint.outcome !== "pending"
          ? complaint.updated_at.toISOString()
          : undefined,
    }));

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      data,
      meta: {
        page,
        pageSize,
        totalPages,
        total: totalCount,
      },
      message: "Dispute complaints fetched successfully.",
    };
  }

  async markUnderReviewGig(complaintId: number) {
    const complaint = await this.prismaService.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      throw new BadRequestException('Complaint not found.');
    }

    if (complaint.outcome !== 'pending') {
      throw new BadRequestException(
        `Complaint already marked as '${complaint.outcome}'. You can only mark pending complaints as under review.`
      );
    }

    if (!complaint.is_challenged) {
      throw new BadRequestException('Complaint was not challenged by the provider.');
    }

    await this.prismaService.complaint.update({
      where: { id: complaintId },
      data: {
        outcome: 'under_review',
      },
    });

    return {
      success: true,
      message: 'Complaint marked under review successfully.',
    };
  }

  async resolveDeputeGig(complaintId: number, param: ResolveDeputeGigDto) {
    const { admin_notes, } = param;

    const outcome = param.outcome as 'provider_won' | 'user_won';

    const allowedOutcomes = ['provider_won', 'user_won'] as const;
    if (!allowedOutcomes.includes(outcome)) {
      throw new BadRequestException(
        `Invalid outcome. Must be one of: ${allowedOutcomes.join(', ')}.`
      );
    }

    const complaint = await this.prismaService.complaint.findUnique({
      where: { id: complaintId },
    });

    if (!complaint) {
      throw new BadRequestException('Complaint not found.');
    }

    if (complaint.outcome !== 'under_review') {
      throw new BadRequestException(
        `Complaint is not under review. Current status: '${complaint.outcome}'.`
      );
    }

    if (['provider_won', 'user_won'].includes(complaint.outcome)) {
      throw new BadRequestException('Complaint is already resolved.');
    }
    await this.prismaService.complaint.update({
      where: { id: complaintId },
      data: {
        admin_feedback: admin_notes?.trim() || '',
        outcome: outcome,
      },
    });

    return {
      success: true,
      message: 'Complaint resolved successfully.',
    };
  }

}