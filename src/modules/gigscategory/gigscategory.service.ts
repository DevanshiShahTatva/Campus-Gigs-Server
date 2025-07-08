import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GigsCategoryDto } from './gigscategory.dto';
import { TireService } from '../tire/tire.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GigsCategoryService {
  constructor(
    private tireTireService: TireService,
    private prismaService: PrismaService,
  ) { }

  async create(body: GigsCategoryDto) {
    const { name, description, tire_id, skillIds } = body;

    // 1. Check for duplicate category name
    const existingCategory = await this.prismaService.gigsCategory.findFirst({ where: { name } });
    if (existingCategory) {
      throw new BadRequestException({ message: 'Category name already exists' });
    }

    // 2. Validate tire_id (check if it exists)
    const tier = await this.tireTireService.findById(tire_id);
    if (!tier) {
      throw new NotFoundException({ message: 'Tier not found' });
    }

    // 3. Validate skills: all must exist
    const skills = await this.prismaService.skills.findMany({
      where: {
        id: { in: skillIds },
      },
    });

    if (skills.length !== skillIds.length) {
      const foundIds = skills.map(s => s.id);
      const missingIds = skillIds.filter(id => !foundIds.includes(id));
      throw new BadRequestException({
        message: `Invalid skill IDs: [${missingIds.join(', ')}]`,
      });
    }

    // 4. Check if any skill is already assigned to another category
    const alreadyUsed = skills.filter(skill => skill.categoryId !== null);
    if (alreadyUsed.length > 0) {
      const usedNames = alreadyUsed.map(skill => skill.name).join(', ');
      throw new BadRequestException({
        message: `These skills are already assigned to another category: ${usedNames}`,
      });
    }

    // 5. Create category
    const category = await this.prismaService.gigsCategory.create({
      data: { name, description, tire_id },
    });

    // 6. Assign skills to the new category
    await this.prismaService.skills.updateMany({
      where: { id: { in: skillIds } },
      data: { categoryId: category.id },
    });

    return { data: category, message: 'Category created successfully' };
  }

  async update(id: number, body: GigsCategoryDto) {
    const existing = await this.prismaService.gigsCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ message: 'Category not found' });

    const { name, description, tire_id, skillIds } = body;

    const duplicate = await this.prismaService.gigsCategory.findFirst({
      where: {
        name,
        is_deleted: false,
        NOT: { id: id },
      },
    });
    if (duplicate) throw new BadRequestException({ message: 'Category name already exists' });

    const tire = await this.prismaService.tire.findUnique({ where: { id: tire_id } });
    if (!tire) throw new NotFoundException({ message: 'Tire not found' });

    // 1. Ensure all skillIds exist
    const existingSkills = await this.prismaService.skills.findMany({
      where: { id: { in: skillIds } },
    });
    if (existingSkills.length !== skillIds.length) {
      const foundIds = existingSkills.map(s => s.id);
      const missingIds = skillIds.filter(id => !foundIds.includes(id));
      throw new BadRequestException({
        message: `Invalid skill IDs: [${missingIds.join(', ')}]`,
      });
    }

    // 2. Ensure skills are not assigned to other categories
    const conflictSkills = existingSkills.filter(
      s => s.categoryId !== null && s.categoryId !== id,
    );
    if (conflictSkills.length > 0) {
      const names = conflictSkills.map(s => s.name).join(', ');
      throw new BadRequestException({
        message: `These skills are already used in other categories: ${names}`,
      });
    }

    // 3. Update category
    await this.prismaService.gigsCategory.update({
      where: { id },
      data: { name, description, tire_id },
    });

    // 4. Reset old skills
    await this.prismaService.skills.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    // 5. Assign new skills
    await this.prismaService.skills.updateMany({
      where: { id: { in: skillIds } },
      data: { categoryId: id },
    });

    return { message: 'Category updated successfully' };
  }


  async delete(id: number) {
    await this.prismaService.gigsCategory.delete({ where: { id } });
  }

  // async getAllIdsByName(search: string) {
  //   let categoryIds: number[] = [];

  //   const baseQuery: any = {};
  //   if (search) {
  //     baseQuery.OR = [{ name: { $regex: search, mode: 'insensitive' } }];
  //   }

  //   const matchingCategories = await this.prismaService.gigsCategory.findMany({
  //     where: {
  //       name: baseQuery,
  //     },
  //   });

  //   categoryIds = matchingCategories.map((cat) => cat.id);

  //   return categoryIds;
  // }



  // async get(query: GigsCategoryQueryParams) {
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
  //       {
  //         tire: {
  //           name: { contains: searchTerm, mode: 'insensitive' },
  //         },
  //       },
  //     ];
  //   }

  //   const [items, total] = await Promise.all([
  //     this.prismaService.gigsCategory.findMany({
  //       where: baseQuery,
  //       orderBy:
  //         sortKey === 'tire'
  //           ? { tire: { name: sortOrder } }
  //           : { [sortKey]: sortOrder },
  //       skip,
  //       take: pageSize,
  //       include: {
  //         tire: true,
  //       },
  //     }),
  //     this.prismaService.gigsCategory.count({ where: baseQuery }),
  //   ]);

  //   const totalPages = Math.ceil(total / pageSize);
  //   const meta = { page, pageSize, total, totalPages };

  //   return { data: items, meta };
  // }

  async findAll() {
    return await this.prismaService.gigsCategory.findMany({
      where: { is_deleted: false },
      include: {
        tire: true,
        skills: true,
      },
    });
  }

  async findById(id: number) {
    const category = await this.prismaService.gigsCategory.findUnique({
      where: { id },
      include: {
        tire: true,
        skills: true,
      },
    });

    if (!category) throw new NotFoundException({ message: 'Category not found' });

    return category;
  }
}
