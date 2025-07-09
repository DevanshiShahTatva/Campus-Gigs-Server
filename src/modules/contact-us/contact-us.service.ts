import { Injectable } from '@nestjs/common';

// dtos
import {
  CreateContactUsDto,
  UpdateContactUsStatusDto,
  ContactUsQueryParams,
  GenerateContactUsResponseDto,
} from './contact-us.dto';
import { CONTACT_US_RESPONSE_PROMPT } from '../../utils/helper';
import { AiService } from '../shared/ai.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactUsService {
  constructor(
    private prismaService: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async create(createContactUsDto: CreateContactUsDto) {
    const createdEntry = await this.prismaService.contactUs.create({
      data: createContactUsDto,
    });
    return createdEntry;
  }

  async findAll(query: ContactUsQueryParams): Promise<any> {
    const {
      page = 1,
      pageSize = 10,
      sortBy = 'created_at',
      sortOrder = 'asc',
      search,
      status,
    } = query;
    const skip = (page - 1) * pageSize;
    const baseQuery: any = {};

    if (search) {
      baseQuery.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
        { status: { contains: search, mode: 'insensitive' } },
      ];
    }
    baseQuery.is_deleted = false;

    if (status) {
      baseQuery.status = status;
    }

    // Determine if collation is needed for case-insensitive sorting
    const queryBuilder = this.prismaService.contactUs.findMany({
      where: baseQuery,
      orderBy: { [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc' },
      skip,
      take: pageSize,
    });

    // if (stringSortFields.includes(sortBy)) {
    //   queryBuilder.collation({ locale: 'en', strength: 2 });
    // }

    const [total, items] = await Promise.all([
      this.prismaService.contactUs.count({ where: baseQuery }),
      queryBuilder,
    ]);
    const totalPages = Math.ceil(total / pageSize);
    return {
      message: 'Contact Us entries retrieved successfully',
      data: items,
      meta: {
        total,
        totalPages,
        page,
        pageSize,
      },
    };
  }

  async updateStatus(id: number, updateStatusDto: UpdateContactUsStatusDto) {
    return this.prismaService.contactUs.update({
      where: { id },
      data: {
        status: updateStatusDto.status as any, // Type assertion to handle Prisma's enum type
      },
    });
  }

  async deleteMany(ids: number[]): Promise<{ deletedCount: number }> {
    const result = await this.prismaService.contactUs.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        is_deleted: true,
      },
    });

    return { deletedCount: result.count };
  }

  async generateContactUsResponse(
    generateContactUsResponseDto: GenerateContactUsResponseDto,
  ): Promise<{ responseSubject: string; responseMessage: string }> {
    const prompt = CONTACT_US_RESPONSE_PROMPT(
      generateContactUsResponseDto.subject,
      generateContactUsResponseDto.message,
    );
    const aiResult = await this.aiService.generateAnswer(prompt);
    // Parse the AI result for subject and message
    const subjectMatch = aiResult.match(/Response Subject:\s*(.*)/i);
    const messageMatch = aiResult.match(/Response Message:\s*([\s\S]*)/i);
    return {
      responseSubject: subjectMatch ? subjectMatch[1].trim() : '',
      responseMessage: messageMatch ? messageMatch[1].trim() : aiResult.trim(),
    };
  }

  async findByUserEmail(email: string) {
    return this.prismaService.contactUs.findMany({
      where: {
        email,
        is_deleted: false,
      },
      orderBy: { created_at: 'desc' },
    });
  }
}
