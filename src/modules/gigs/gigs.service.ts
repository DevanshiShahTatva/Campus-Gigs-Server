import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { GigsQueryParams, PostGigsDto } from './gigs.dto';
import { AwsS3Service } from '../shared/aws-s3.service';
import { PrismaService } from '../prisma/prisma.service';

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

    return gig;
  }

  async get(query: GigsQueryParams) {
    const { page, pageSize, search, status } = query;
    const skip = (page - 1) * pageSize;

    const baseQuery: any = {};

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

    if (status) {
      baseQuery.AND = [{ status: status }];
    }

    const [items, total] = await Promise.all([
      this.prismaService.gigs.findMany({
        where: baseQuery,
        skip,
        take: pageSize,
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
        },
      }),
      this.prismaService.gigs.count({ where: baseQuery }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    const meta = { page, pageSize, total, totalPages };

    return { data: items, meta, message: 'Gigs fetch successfully' };
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
        },
      }),
      this.prismaService.gigs.count({ where: baseQuery }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    const meta = { page, pageSize, total, totalPages };

    return { data: items, meta, message: 'Gigs fetch successfully' };
  }

  async findById(id: number) {
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
      },
    });

    return gig;
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
