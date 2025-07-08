import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillDto } from './skills.dto';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('skills')
export class SkillsController {
    constructor(private readonly skillsService: SkillsService) { }

    @Get()
    findAll() {
        return this.skillsService.getAllSkills();
    }

    @Get('dropdown')
    getDropdownOptions() {
        return this.skillsService.getSkillDropdownOptions();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.skillsService.getSkillById(+id);
    }


    @Roles('admin')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Post()
    create(@Body() dto: SkillDto) {
        return this.skillsService.createSkill(dto);
    }


    @Roles('admin')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Put(':id')
    update(@Param('id') id: string, @Body() dto: SkillDto) {
        return this.skillsService.updateSkill(+id, dto);
    }

    @Roles('admin')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.skillsService.deleteSkill(+id);
    }
}
