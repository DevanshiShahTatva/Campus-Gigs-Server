import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { TireDto } from './tire.dto';
import { TireService } from './tire.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('tire')
export class TireController {
  constructor(private tireService: TireService) { }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  async createTire(@Body() body: TireDto) {
    return await this.tireService.create(body);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Put(':id')
  async updateTire(@Param('id') id: string, @Body() body: TireDto) {
    await this.tireService.update(Number(id), body);
    return { message: 'Tire updated successfully' };
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  async deleteTire(@Param('id') id: string) {
    await this.tireService.delete(Number(id));
    return { message: 'Tier deleted successfully' };
  }

  // PUBLIC APIS
  @Get()
  async findAll() {
    const data = await this.tireService.findAll();
    return { data, message: 'Tiers fetched successfully' };
  }
  @Get('dropdown')
  getDropdownOptions() {
    return this.tireService.getTiersDropdownOptions();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.tireService.findById(Number(id));
    return { data, message: 'Tier fetched successfully' };
  }
}
