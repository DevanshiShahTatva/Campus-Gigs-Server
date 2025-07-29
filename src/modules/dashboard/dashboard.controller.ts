import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UseGuards } from '@nestjs/common';

@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles('admin')
  async getDashboardSummary() {
    return await this.dashboardService.getSummary();
  }

  @Get('revenue-overview')
  @Roles('admin')
  async getRevenueOverview(@Query('range') range: string = '7_days') {
    return this.dashboardService.getRevenueOverview(range);
  }
}
