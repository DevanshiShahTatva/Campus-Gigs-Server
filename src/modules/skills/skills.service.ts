import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { SkillDto } from './skills.dto';

@Injectable()
export class SkillsService {
    constructor(private prisma: PrismaService) { }

    async getSkillDropdownOptions() {
        const skills = await this.prisma.skills.findMany({
            where: { is_deleted: false },
            select: {
                id: true,
                name: true,
            },
            orderBy: {
                name: 'asc', // optional: alphabetically sorted
            },
        });
        return skills.map(skill => ({
            id: String(skill.id),
            label: skill.name,
        }));
    }

    async getAllSkills() {
        return this.prisma.skills.findMany({
            where: { is_deleted: false },
            include: {
                category: {
                    select: {
                        name: true,
                    },
                },
            },
        });
    }

    async getSkillById(id: number) {
        return this.prisma.skills.findUnique({
            where: { id, is_deleted: false },
        });
    }

    async createSkill(dto: SkillDto) {
        // Check if name already exists (and not deleted)
        const exists = await this.prisma.skills.findFirst({
            where: {
                name: dto.name,
                is_deleted: false,
            },
        });

        if (exists) {
            throw new BadRequestException(`Skill with name '${dto.name}' already exists.`);
        }

        return this.prisma.skills.create({
            data: {
                name: dto.name,
            },
        });
    }



    async updateSkill(id: number, dto: SkillDto) {
        const findSameName = await this.prisma.skills.findFirst({
            where: {
                name: dto.name,
                NOT: {
                    id: id, // exclude the current record from duplicate check
                },
            },
        });
        if (findSameName) {
            throw new BadRequestException(`Skill with name '${dto.name}' already exists.`);
        }

        return this.prisma.skills.update({
            where: { id },
            data: {
                name: dto.name,
            },
        });
    }

    async deleteSkill(id: number) {
        const skill = await this.prisma.skills.findUnique({
            where: { id },
            include: {
                category: true,
                users: {
                    where: { is_deleted: false },
                    select: { id: true },
                },
            },
        });

        if (!skill) {
            throw new NotFoundException('Skill not found.');
        }

        if (skill.categoryId !== null) {
            throw new BadRequestException('This skill is assigned to a category and cannot be deleted.');
        }

        if (skill.users.length > 0) {
            throw new BadRequestException('This skill is assigned to one or more users and cannot be deleted.');
        }

        return await this.prisma.skills.update({
            where: { id },
            data: { is_deleted: true },
        });

        // const skill = await this.prisma.skills.findUnique({
        //     where: { id },
        //     include: {
        //         category: {
        //             where: { is_deleted: false },
        //         },
        //     },
        // });

        // if (skill?.category) {
        //     throw new BadRequestException('This skill is already assigned to a category and cannot be deleted.');
        // }
        // return this.prisma.skills.update({
        //     where: { id },
        //     data: {
        //         is_deleted: true,
        //     },
        // });
    }
}


