import { Injectable, NotFoundException } from '@nestjs/common';

import {
  CreatePrivacyPolicyDto,
  UpdatePrivacyPolicyDto,
  GeneratePrivacyPolicyDto,
} from './privacy-policy.dto';
import { PRIVACY_POLICY_GENERATION_PROMPT } from '../../utils/helper';
import { AiService } from '../shared/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';

@Injectable()
export class PrivacyPolicyService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly userService: UserService,
    private readonly aiService: AiService,
  ) {}

  async create(createDto: CreatePrivacyPolicyDto) {
    return this.prismaService.privacyPolicy.create({
      data: createDto,
    });
  }

  async findAll() {
    return this.prismaService.privacyPolicy.findMany();
  }

  async findOne(id: number) {
    const policy = await this.prismaService.privacyPolicy.findUnique({
      where: {
        id,
      },
    });
    if (!policy) throw new NotFoundException('Privacy Policy not found');
    return policy;
  }

  async update(id: number, updateDto: UpdatePrivacyPolicyDto) {
    const updated = await this.prismaService.privacyPolicy.update({
      where: {
        id,
      },
      data: updateDto,
    });

    await this.userService.updatePolicyForAllUser();

    if (!updated) throw new NotFoundException('Privacy Policy not found');
    return updated;
  }

  async remove(id: number) {
    const result = await this.prismaService.privacyPolicy.delete({
      where: {
        id,
      },
    });
    if (!result) throw new NotFoundException('Privacy Policy not found');
    return { message: 'Deleted successfully' };
  }

  async generatePrivacyPolicy(
    generatePrivacyPolicyDto: GeneratePrivacyPolicyDto,
  ): Promise<{ content: string }> {
    const prompt = PRIVACY_POLICY_GENERATION_PROMPT(
      generatePrivacyPolicyDto.keywords,
    );
    const content = await this.aiService.generateAnswer(prompt);
    return { content };
  }
}
