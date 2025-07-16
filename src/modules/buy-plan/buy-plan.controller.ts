import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BuyPlanService } from './buy-plan.service';
import { CreateBuyPlanDto } from './dto/create-buy-plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt.auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ROLE } from 'src/utils/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { BuyPlanDto } from './dto/buy-plan.dto';

@Controller('subscription-plan')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE.USER)
export class BuyPlanController {
  constructor(private readonly buyPlanService: BuyPlanService) {}

  @Post('buy')
  async create(@Body() createBuyPlanDto: CreateBuyPlanDto, @Req() req: any) {
    return this.buyPlanService.createFreePlan(createBuyPlanDto, req.user.id);
  }

  @Post('create-order/:subscriptionId')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Param('subscriptionId', ParseIntPipe) subscriptionId: number,
  ) {
    return this.buyPlanService.createOrder(subscriptionId);
  }

  @Post('buy-paid-plan/:subscriptionId/:orderId')
  @HttpCode(HttpStatus.OK)
  async buyPaidPlan(
    @Param('subscriptionId', ParseIntPipe) subscriptionId: number,
    @Param('orderId') orderId: string,
    @Body() body: BuyPlanDto,
    @Req() req: any,
  ) {
    const userId = req.user.id;
    return this.buyPlanService.buyPaidPlan(subscriptionId, orderId, body, userId);
  }

  @Post('create-subscription-session')
  async createSubscriptionSession(
    @Body('subscriptionPlanId') subscriptionPlanId: string,
  ) {
    return this.buyPlanService.createSubscriptionSession(Number(subscriptionPlanId));
  }

  @Get('current')
  async findActive(@Req() req: any) {
    return this.buyPlanService.findActivePlan(req.user.id);
  }

  @Get('history')
  async getHistory(@Req() req: any) {
    return this.buyPlanService.getPlanHistory(req.user.id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.buyPlanService.cancelPlan(id, req.user.id);
    return { message: 'Subscription cancelled successfully' };
  }
}
