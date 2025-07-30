import { Injectable } from '@nestjs/common';
import { SignupDto, UserQueryParamsDto } from './user.dto';
import { AwsS3Service } from '../shared/aws-s3.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { excludeFromObject } from 'src/utils/helper';
import { Skills } from '@prisma/client';
import { AgreedTemsPolicy } from '../auth/auth.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class UserService {
  constructor(
    private awsS3Service: AwsS3Service,
    private prismaService: PrismaService,
    private readonly cloudinaryService: CloudinaryService
  ) {}

  async create(
    userBody: SignupDto,
    file?: Express.Multer.File,
    validSkills: Skills[] = [],
  ) {
    let profile: string = '';

    if (file) {
      const upload = await this.cloudinaryService.saveFileToCloud("profile", file);
      profile = upload.url;
    }

    const salt = 10;
    const hashpassword = await bcrypt.hash(userBody.password, salt);

    const { skills, ...rest } = userBody;

      const preferences =
        await this.prismaService.notificationPreferences.create({
          data: {
            show_chat: true,
            show_bid: true,
            show_payment: true,
            show_rating: true,
          },
        });

    const user = await this.prismaService.user.create({
      data: {
        ...rest,
        profile,
        password: hashpassword,
        preferences: {
          connect: {
            id: preferences.id,
          },
        },
        skills: {
          connect: validSkills.map((s) => ({ id: s.id })),
        },
      },
      include: {
        skills: true,
      },
    });

    return excludeFromObject(user, ['password']);
  }

  async updateUser(id: number, updateData: any, file?: Express.Multer.File) {
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    if (file) {
      if (user.profile) {
        const pubKey = this.cloudinaryService.extractPublicIdFromUrl(user.profile);
        if (pubKey) {
          await this.cloudinaryService.deleteFromCloudinary(pubKey);
        }
      }

      const upload = await this.cloudinaryService.saveFileToCloud("profile", file);
      updateData['profile'] = upload.url;
    }

    const { skills, ...rest } = updateData;
    const updatePayload: any = {
      ...rest,
    };
    if (skills && Array.isArray(skills)) {
      const skillIds = skills.map(Number);

      const validSkills = await this.prismaService.skills.findMany({
        where: {
          id: { in: skillIds },
          is_deleted: false,
        },
      });

      updatePayload.skills = {
        set: validSkills.map((skill) => ({ id: skill.id })), // replaces existing skills
      };
    }

    // Only update provided fields, do not overwrite others with undefined
    const dataToUpdate = {};
    for (const key in updatePayload) {
      if (updatePayload[key] !== undefined) {
        dataToUpdate[key] = updatePayload[key];
      }
    }
    return this.prismaService.user.update({
      where: { id },
      data: dataToUpdate,
      include: {
        skills: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async updatePolicyForAllUser() {
    return await this.prismaService.user.updateMany({
      where: { is_agreed: true },
      data: { is_agreed: false },
    });
  }

  async updateAgreedForUser(body: AgreedTemsPolicy) {
    return await this.prismaService.user.update({
      where: { id: body.user_id },
      data: { is_agreed: true }
    });
  }

  async findByEmail(email: string) {
    return await this.prismaService.user.findUnique({ where: { email } });
  }

  async findPortfolioById(id: number) {
    const user = await this.prismaService.user.findUnique({
      where: { id },
      include: {
        skills: {
          select: { id: true, name: true },
        },
        preferences: true,
        gigs_provider: {
          select: {
            id: true,
            title: true,
            images: true,
            description: true,
            skills: true,
            price: true,
            gig_category: {
              select:{
                created_at: true,
                description: true,
                id: true,
                name: true,
                tire_id: true,
                is_deleted: true,
                tire: {
                  select:{
                    created_at: true,
                    description: true,
                    id: true,
                    is_deleted: true,
                    name: true,
                    updated_at: true,
                  }
                }
              }
            },
            certifications: true,
            rating: {
              where: { is_deleted: false },
              select: {
                id: true,
                rating: true,
                rating_feedback: true,
                created_at: true,
                user: {
                  select: { id: true, name: true, profile: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    //  Current User Ratings & Review Count
    const gigsWithRatings = user.gigs_provider.filter(
    (gig) => gig.rating && gig.rating.rating > 0
    );
    const userRatings = gigsWithRatings.map((gig) => gig.rating!.rating);
    const userAvgRating =
      userRatings.length > 0
        ? userRatings.reduce((acc, curr) => acc + curr, 0) / userRatings.length
        : 0;
    const userReviewCount = userRatings.length;

    //  All Users Avg Ratings & Review Counts
    const allUsers = await this.prismaService.user.findMany({
      where: { is_deleted: false },
      select: {
        gigs_provider: {
          select: {
            rating: {
              where: { is_deleted: false },
              select: { rating: true },
            },
          },
        },
      },
    });

    let highestAvgRating = 0;
    let highestReviewCount = 0;

    allUsers.forEach((u) => {
      const ratings = u.gigs_provider.flatMap((gig) =>
      gig.rating ? [gig.rating.rating] : []
      );
      if (ratings.length > 0) {
        const avg =
          ratings.reduce((acc, curr) => acc + curr, 0) / ratings.length;
        if (avg > highestAvgRating) highestAvgRating = avg;
      }
      if (ratings.length > highestReviewCount)
        highestReviewCount = ratings.length;
    });

    //  Checks
    const isTopRated = userAvgRating >= highestAvgRating;
    const isMostRated = userReviewCount >= highestReviewCount;

    return {
      ...user,
      gigs_provider: gigsWithRatings,
      userAvgRating: parseFloat(userAvgRating.toFixed(2)),
      highestAvgRating: parseFloat(highestAvgRating.toFixed(2)),
      userReviewCount,
      highestReviewCount,
      isTopRated, //  Current user has highest avg rating
      isMostRated, //  Current user has most total reviews
    };
  }

  async findTopPortfolios() {
  const users = await this.prismaService.user.findMany({
    where: {
      is_deleted: false,
      role: { not: 'admin' }, // exclude admins
    },
    select: {
      id: true,
      name: true,
      profile: true,
      skills: { select: { id: true, name: true } },
      gigs_provider: {
        select: {
          id: true,
          title: true,
          description: true,
          price: true,
          images: true,
          skills: true,
          certifications: true,
          gig_category: true,
          rating: {
            where: { is_deleted: false },
            select: {
              id: true,
              rating: true,
              rating_feedback: true,
              created_at: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  profile: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Calculate scores for ranking
  const scoredUsers = users.map((user) => {
    const gigs = user.gigs_provider || [];

    const ratings = gigs.flatMap((gig) =>
      gig.rating ? [gig.rating.rating] : [],
    );

    const reviewCount = ratings.length;
    const avgRating =
      reviewCount > 0
        ? ratings.reduce((acc, curr) => acc + curr, 0) / reviewCount
        : 0;

    const gigCount = gigs.length;

    // Weighted score (adjust weights if needed)
    const score = avgRating * 2 + reviewCount * 1 + gigCount * 1;

    return {
      ...user,
      avgRating: parseFloat(avgRating.toFixed(2)),
      reviewCount,
      gigCount,
      score,
    };
  });

  // Sort by score descending and return top 4
  const topProviders = scoredUsers.sort((a, b) => b.score - a.score).slice(0, 4);

  return topProviders;
}


async ensureNotificationPreferences(userId: number) {
  
  const user = await this.findById(userId);
  if (!user) return null;

  if (!user.preferencesId) {
    const newPrefs = await this.prismaService.notificationPreferences.create({
      data: {
        show_chat: true,
        show_bid: true,
        show_payment: true,
        show_rating: true,
      },
    });

    await this.updateUser(userId, {
      preferencesId: newPrefs.id,
    });

    return newPrefs;
  }

  return await this.prismaService.notificationPreferences.findUnique({
    where: { id: user.preferencesId },
  });
}


  async findById(id: number) {
    return this.prismaService.user.findUnique({
      where: { id },
      include: {
        skills: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

async updateNotificationPreferences(
  userId: number,
  preferences: Partial<{
    show_chat: boolean;
    show_bid: boolean;
    show_payment: boolean;
    show_rating: boolean;
  }>
) {
  const user = await this.prismaService.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // If user already has preferences, update them
  if (user.preferencesId) {
    return this.prismaService.notificationPreferences.update({
      where: { id: user.preferencesId },
      data: preferences,
    });
  }

  // Otherwise, create preferences and link to user
  const newPreferences = await this.prismaService.notificationPreferences.create({
    data: preferences,
  });

  // Update user with new preferences ID
  await this.prismaService.user.update({
    where: { id: userId },
    data: {
      preferencesId: newPreferences.id,
    },
  });

  return newPreferences;
}

  async deleteProfilePhoto(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: Number(userId) },
    });

    if (user?.profile) {
      const pubKey = this.cloudinaryService.extractPublicIdFromUrl(user?.profile);
      if (pubKey) {
        await this.cloudinaryService.deleteFromCloudinary(pubKey);
      }
    }

    return await this.prismaService.user.update({
      where: { id: Number(userId) },
      data: { profile: '' },
    });
  }

  async getAllUserList(query: UserQueryParamsDto) {
    const { page, pageSize, search, sortKey, sortOrder } = query;
    console.log(page, pageSize);
    const skip = (page - 1) * pageSize;

    const baseQuery: any = {
      AND: [{ role: 'user' }],
    };

    if (search) {
      baseQuery.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prismaService.user.findMany({
        where: baseQuery,
        orderBy: { [sortKey]: sortOrder },
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          subscription_plans: {
            include: {
              subscription_plan: {
                select: {
                  roles_allowed: true,
                },
              },
            },
          },
        },
      }),
      this.prismaService.user.count({ where: baseQuery }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    const meta = { page, pageSize, total, totalPages };

    return { data: items, meta: meta, message: 'Users fetch successfully' };
  }
}
