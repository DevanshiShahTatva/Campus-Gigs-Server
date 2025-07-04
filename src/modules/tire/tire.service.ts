import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { TireDto, TireQueryParams } from './tire.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TireService {
  constructor(
    private prismaService: PrismaService,
  ) { }

  async create(body: TireDto) {
    const findSameName = await this.prismaService.tire.findFirst({
      where: { name: body.name },
    });
    if (findSameName) {
      throw new BadRequestException({
        status: HttpStatus.CONFLICT,
        message: `The name '${body.name}' is already been taken`,
      });
    }

    return await this.prismaService.tire.create({ data: body });
  }

  async update(id: number, body: TireDto) {
    const findSameName = await this.prismaService.tire.findFirst({
      where: { name: body.name, NOT: { id } },
    });
    if (!findSameName) {
      throw new BadRequestException({
        status: HttpStatus.CONFLICT,
        message: `The name '${body.name}' is already been taken`,
      });
    }

    return await this.prismaService.tire.update({
      where: { id },
      data: body,
    });
  }

  async delete(id: number) {
    return await this.prismaService.tire.update({
      where: { id },
      data: {
        is_deleted: true,
      },
    });
  }

  async findAll() {
    return this.prismaService.tire.findMany({
      orderBy: { name: 'asc' },
      where: { is_deleted: false }
    });
  }

  async findById(id: number) {
    return await this.prismaService.tire.findUnique({ where: { id } });
  }

  // async get(query: TireQueryParams) {
  //   const {
  //     page,
  //     pageSize,
  //     search,
  //     sortKey = 'name',
  //     sortOrder = 'desc',
  //   } = query;

  //   const baseQuery: any = {};

  //   const skip = (page - 1) * pageSize;

  //   if (search) {
  //     const searchTerm = search.toLowerCase();

  //     baseQuery.OR = [
  //       { name: { contains: searchTerm, mode: 'insensitive' } },
  //       { description: { contains: searchTerm, mode: 'insensitive' } },
  //     ];
  //   }

  //   const [items, total] = await Promise.all([
  //     this.prismaService.tire.findMany({
  //       where: baseQuery,
  //       orderBy: {
  //         [sortKey]: sortOrder.toLowerCase() as 'asc' | 'desc',
  //       },
  //       skip,
  //       take: pageSize,
  //     }),
  //     this.prismaService.tire.count({ where: baseQuery }),
  //   ]);

  //   const totalPages = Math.ceil(total / pageSize);
  //   const meta = { page, pageSize, total, totalPages };

  //   return { data: items, meta };
  // }



}
