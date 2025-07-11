import { Injectable } from '@nestjs/common';
import { SignupDto, UserQueryParamsDto } from './user.dto';
import { AwsS3Service } from '../shared/aws-s3.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { excludeFromObject } from 'src/utils/helper';
import { Skills } from '@prisma/client';
import { AgreedTemsPolicy } from '../auth/auth.dto';

@Injectable()
export class UserService {
  constructor(
    private awsS3Service: AwsS3Service,
    private prismaService: PrismaService,
  ) {}

  async create(userBody: SignupDto, file?: Express.Multer.File, validSkills: Skills[] = []) {
    let profile: string = '';

    if (file) {
      profile = await this.awsS3Service.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        'profile',
      );
    }

    const salt = 10;
    const hashpassword = await bcrypt.hash(userBody.password, salt);

    const { skills, ...rest } = userBody;

    const user = await this.prismaService.user.create({
      data: {
        ...rest,
        profile,
        password: hashpassword,
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

  async updateUser(
    id: number,
    updateData: any,
    file?: Express.Multer.File,
  ) {
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');

    if (file) {
      if (user.profile) {
        const key = this.awsS3Service.getKeyFromUrl(user.profile);
        await this.awsS3Service.deleteFile(key);
      }

      const newProfileUrl = await this.awsS3Service.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        'profile',
      );
      updateData['profile'] = newProfileUrl;
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

  async deleteProfilePhoto(userId: string) {
    const user = await this.prismaService.user.findUnique({ where: { id: Number(userId) } });

    if (user?.profile) {
      const key = this.awsS3Service.getKeyFromUrl(user?.profile);
      await this.awsS3Service.deleteFile(key);
    }

    return await this.prismaService.user.update({
      where: { id: Number(userId)},
      data: { profile: "" }
    })
  }

  async getAllUserList(query: UserQueryParamsDto) {
    const { page, pageSize, search } = query;
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
