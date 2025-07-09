import { BadRequestException, Injectable } from '@nestjs/common';
import { SignupDto } from './user.dto';
import { AwsS3Service } from '../shared/aws-s3.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { excludeFromObject } from 'src/utils/helper';

@Injectable()
export class UserService {
  constructor(
    private awsS3Service: AwsS3Service,
    private prismaService: PrismaService,
  ) {}

  async create(userBody: SignupDto, file?: Express.Multer.File) {
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

    const user = await this.prismaService.user.create({
      data: {
        ...userBody,
        profile,
        password: hashpassword
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

    // Only update provided fields, do not overwrite others with undefined
    const dataToUpdate = {};
    for (const key in updateData) {
      if (updateData[key] !== undefined) {
        dataToUpdate[key] = updateData[key];
      }
    }
    return this.prismaService.user.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  async updatePolicyForAllUser() {
    return await this.prismaService.user.updateMany({
      where: { is_agreed: true },
      data: { is_agreed: false },
    });
  }

  async findByEmail(email: string) {
    return await this.prismaService.user.findUnique({ where: { email } });
  }

  async findById(id: number) {
    return await this.prismaService.user.findUnique({ where: { id } });
  }
}
