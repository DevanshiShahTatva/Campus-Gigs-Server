import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChangeGigPriorityDto,
  ChangeGigStatusDto,
  GigPipelineQueryParams,
  GigsQueryParams,
  PostGigsDto,
} from './gigs.dto';
import { AwsS3Service } from '../shared/aws-s3.service';
import { PrismaService } from '../prisma/prisma.service';
import { GIG_STATUS } from 'src/utils/enums';
import { BID_STATUS } from '@prisma/client';

@Injectable()
export class GigsService {
  constructor(
    private awsS3Service: AwsS3Service,
    private prismaService: PrismaService,
  ) {}

  async create(body: PostGigsDto, files?: Express.Multer.File[]) {
    const imageUrls: string[] = [];

    if (files?.length) {
      for (const file of files) {
        const url = await this.awsS3Service.uploadFile(
          file.buffer,
          file.originalname,
          file.mimetype,
          'gig',
        );
        imageUrls.push(url);
      }
    }

    const { skills, ...rest } = body;

    const gig = await this.prismaService.gigs.create({
      data: {
        ...rest,
        images: imageUrls,
        skills: {
          connect: skills?.map((id) => ({ id: Number(id) })) || [],
        },
      },
    });

    return { message: 'Gigs created successfully', data: gig };
  }

  async get(query: GigsQueryParams) {
    const { page, pageSize, search, minRating, paymentType, minPrice, maxPrice, startDate, endDate } = query;
    const skip = (page - 1) * pageSize;

    const baseQuery: any = {
      AND: [{ status: GIG_STATUS.UNSTARTED }],
    };

    if (paymentType && Array.isArray(paymentType) && paymentType.length > 0) {
      baseQuery.AND.push({ payment_type: { in: paymentType } });
    }
    if (typeof minPrice === 'number') {
      baseQuery.AND.push({ price: { gte: minPrice } });
    }
    if (typeof maxPrice === 'number') {
      baseQuery.AND.push({ price: { lte: maxPrice } });
    }
     if (startDate && endDate) {
        baseQuery.AND.push({
          start_date_time: { gte: new Date(startDate) },
          end_date_time: { lte: new Date(endDate) },
        });
      } else if (startDate) {
        baseQuery.AND.push({
          OR: [
            { start_date_time: { gte: new Date(startDate) } },
            { end_date_time: { gte: new Date(startDate) } },
          ],
        });
      } else if (endDate) {
        baseQuery.AND.push({
          OR: [
            { end_date_time: { lte: new Date(endDate) } },
            { start_date_time: { lte: new Date(endDate) } },
          ],
        });
      }
    if (query.category && Array.isArray(query.category) && query.category.length > 0) {
      baseQuery.AND.push({ gig_category_id: { in: query.category.map(Number) } });
    }
    
    if (search) {
      baseQuery.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { certifications: { has: search } },
        {
          gig_category: {
            is: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
        },
        {
          skills: {
            some: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prismaService.gigs.findMany({
        where: baseQuery,
        skip,
        take: pageSize,
        orderBy: { created_at: "desc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              profile: true,
              professional_interests: true,
              extracurriculars: true,
              certifications: true,
              education: true,
              skills: true,
              Rating: true,
            },
          },
          skills: {
            select: {
              id: true,
              name: true,
            },
          },
          gig_category: {
            select: {
              id: true,
              name: true,
              description: true,
              tire: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              bids: {
                where: {
                  is_deleted: false,
                },
              },
            },
          },
        },
      }),
      this.prismaService.gigs.count({ where: baseQuery }),
    ]);
  
    const totalPages = Math.ceil(total / pageSize);
    const meta = { page, pageSize, total, totalPages };

    const itemsWithRating = await Promise.all(items.map(async gig => {
      const providerId = gig.user.id;
      // Fetch all ratings for gigs where this user was the provider
      const providerRatings = await this.prismaService.rating.findMany({
        where: {
          gig: {
            provider_id: providerId,
          },
        },
        select: { rating: true },
      });
      let averageRating;
      if (providerRatings.length > 0) {
        const total = providerRatings.reduce((sum, r) => sum + r.rating, 0);
        averageRating = Number(total / providerRatings.length).toFixed(1);
      }else {
        averageRating = 0;
      }
      return {
        ...gig,
        user: {
          ...gig.user,
          averageRating: averageRating !== undefined ? averageRating : undefined,
        },
      };
    }));
    // Filter by minRating if provided
      const filteredItems = typeof minRating === 'number' ? itemsWithRating.filter(gig => gig.user.averageRating >= minRating) : itemsWithRating;
      return { data: filteredItems, meta, message: 'Gigs fetch successfully' };
  }

  async getMyGigs(query: GigsQueryParams, user_id: string) {
    const { page, pageSize, status, profile_type } = query;
    const skip = (page - 1) * pageSize;

    const baseQuery: any = {
      AND: [{ user_id: user_id }],
    };

    if (status) {
      baseQuery.AND.push({ status });
    }

    if (profile_type) {
      baseQuery.AND.push({ profile_type });
    }

    const [items, total] = await Promise.all([
      this.prismaService.gigs.findMany({
        where: baseQuery,
        skip,
        take: pageSize,
        orderBy: { created_at: "desc" },
        include: {
          bids: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              profile: true,
              professional_interests: true,
              extracurriculars: true,
              certifications: true,
              education: true,
              skills: true,
            },
          },
          skills: {
            select: {
              id: true,
              name: true,
            },
          },
          gig_category: {
            select: {
              id: true,
              name: true,
              description: true,
              tire: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          gig_payment: true,
          rating: {
            select: {
              id: true,
              rating: true,
              rating_feedback: true,
              created_by_id: true,
            },
          },
        },
      }),
      this.prismaService.gigs.count({ where: baseQuery }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    const meta = { page, pageSize, total, totalPages };

    return { data: items, meta, message: 'Gigs fetch successfully' };
  }

  async getPipelineGigs(query: GigPipelineQueryParams, user_id: string) {
    const { page, pageSize, status } = query;
    const skip = (page - 1) * pageSize;

    let baseQuery: any = {
      AND: [
        { is_deleted: false },
        { bids: { some: { provider_id: user_id } } },
      ],
    };

    if (status === BID_STATUS.pending) {
      baseQuery.AND.push({
        bids: {
          some: {
            provider_id: user_id,
            status: BID_STATUS.pending,
          },
        },
      });
    }

    if (status === BID_STATUS.accepted) {
      baseQuery.AND.push(
        {
          bids: {
            some: {
              provider_id: user_id,
              status: BID_STATUS.accepted,
            },
          },
        },
        {
          status: GIG_STATUS.UNSTARTED,
        },
      );
    }

    if (status === GIG_STATUS.INPROGRESS) {
      baseQuery.AND.push(
        {
          bids: {
            some: {
              provider_id: user_id,
              status: BID_STATUS.accepted,
            },
          },
        },
        {
          status: GIG_STATUS.INPROGRESS,
        },
      );
    }

    if (status === GIG_STATUS.COMPLETED) {
      baseQuery.AND.push(
        {
          bids: {
            some: {
              provider_id: user_id,
              status: BID_STATUS.accepted,
            },
          },
        },
        {
          status: GIG_STATUS.COMPLETED,
        },
      );
    }

    if (status === BID_STATUS.rejected) {
      baseQuery = {
        AND: [
          { is_deleted: false },
          {
            rating: {
              rating: {
                lt: 4,
              },
            },
          },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prismaService.gigs.findMany({
        where: baseQuery,
        skip,
        take: pageSize,
        include: {
          bids: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              profile: true,
              professional_interests: true,
              extracurriculars: true,
              certifications: true,
              education: true,
              skills: true,
            },
          },
          skills: {
            select: {
              id: true,
              name: true,
            },
          },
          gig_category: {
            select: {
              id: true,
              name: true,
              description: true,
              tire: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          gig_payment: true,
          rating: {
            select: {
              id: true,
              rating: true,
              rating_feedback: true,
              created_by_id: true,
            },
          },
          provider: {
            select: {
              id: true,
              name: true,
              completed_stripe_kyc: true,
              stripe_account_id: true
            }
          }
        },
      }),
      this.prismaService.gigs.count({ where: baseQuery }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    const meta = { page, pageSize, total, totalPages };

    return { data: items, meta, message: 'Gigs fetch successfully' };
  }

  async updateGigStatus(gigId: string, body: ChangeGigStatusDto) {
    const findGig = await this.prismaService.gigs.findUnique({
      where: { id: Number(gigId) },
    });

    if (!findGig) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'Gig not found',
      });
    };

    const allowedTransitions: Record<GIG_STATUS, GIG_STATUS[]> = {
      [GIG_STATUS.UNSTARTED]: [GIG_STATUS.INPROGRESS, GIG_STATUS.REJECTED],
      [GIG_STATUS.INPROGRESS]: [GIG_STATUS.COMPLETED, GIG_STATUS.REJECTED],
      [GIG_STATUS.COMPLETED]: [],
      [GIG_STATUS.REJECTED]: [],
    };

    if (!allowedTransitions[findGig.status].includes(body.status)) {
      throw new BadRequestException(
        `Cannot transition from ${findGig.status} to ${body.status}`,
      );
    }

    await this.prismaService.gigs.update({
      where: { id: Number(gigId) },
      data: {
        status: body.status,
        completed_at: body.status === GIG_STATUS.COMPLETED ? new Date() : undefined,
        rating_reminder_time: body.status === GIG_STATUS.COMPLETED ? new Date(Date.now() + 5 * 60 * 1000) : undefined,
        payment_release_time: body.status === GIG_STATUS.COMPLETED ? new Date(Date.now() + 10 * 60 * 1000) : undefined,
        has_before_reminder_sent: body.status === GIG_STATUS.COMPLETED ? false : undefined,
        has_after_reminder_sent: body.status === GIG_STATUS.COMPLETED ? false : undefined,
      },
    });

    return { message: 'Gig status changed successfully' };
  }

  async updateGigPriority(gigId: string, body: ChangeGigPriorityDto) {
    const findGig = await this.prismaService.gigs.findUnique({
      where: { id: Number(gigId) },
    });

    if (!findGig) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'Gig not found',
      });
    }

    if (findGig.status !== "in_progress") {
      throw new BadRequestException({
        status: HttpStatus.BAD_REQUEST,
        message: 'Priority can be set for only in progress gigs',
      });
    }

    await this.prismaService.gigs.update({
      where: { id: Number(gigId) },
      data: {
        priority: body.priority,
      },
    });

    return { message: 'Gig priority updated successfully' };
  }

  async findById(id: number, user_id: number) {
    const gig = await this.prismaService.gigs.findUnique({
      where: { id },
      include: {
        skills: {
          select: {
            id: true,
            name: true,
          },
        },
        gig_category: {
          select: {
            name: true,
          },
        },
        bids: {
          where: {
            provider_id: user_id,
            is_deleted: false,
          },
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    return {
      ...gig,
      hasBid: gig?.bids && gig.bids.length > 0,
    };
  }

  async put(id: number, body: PostGigsDto, files?: Express.Multer.File[]) {
    const findGigs = await this.prismaService.gigs.findUnique({
      where: { id: id },
    });

    if (!findGigs) {
      throw new NotFoundException('Gigs not found');
    }

    const retainedImages = body.images || [];

    const imagesToDelete = (findGigs.images || []).filter(
      (img) => !retainedImages.includes(img),
    );

    for (const img of imagesToDelete) {
      const key = this.awsS3Service.getKeyFromUrl(img);
      await this.awsS3Service.deleteFile(key);
    }

    const newImageUrls: string[] = [];

    if (files?.length) {
      for (const file of files) {
        const url = await this.awsS3Service.uploadFile(
          file.buffer,
          file.originalname,
          file.mimetype,
          'gig',
        );
        newImageUrls.push(url);
      }
    }

    const finalImages = [...retainedImages, ...newImageUrls];

    const updatedGig = await this.prismaService.gigs.update({
      where: { id: id },
      data: {
        ...body,
        images: finalImages,
        skills: {
          connect: body.skills?.map((id) => ({ id: Number(id) })) || [],
        },
      },
    });

    return { message: 'Gigs updated successfully', data: updatedGig };
  }

  async delete(id: number) {
    const findGigs = await this.prismaService.gigs.findUnique({
      where: { id: id },
    });

    if (!findGigs) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'Gigs not found',
      });
    }

    if (findGigs.images && findGigs.images.length > 0) {
      for (const imageUrl of findGigs.images) {
        const key = this.awsS3Service.getKeyFromUrl(imageUrl);
        await this.awsS3Service.deleteFile(key);
      }
    }

    await this.prismaService.gigs.delete({ where: { id: id } });

    return { message: 'Gigs deleted successfully' };
  }
}
