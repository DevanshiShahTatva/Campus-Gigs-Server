import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { UserService } from './user.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserQueryParamsDto } from './user.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { BuyPlanService } from '../buy-plan/buy-plan.service';
import { excludeFromObject } from 'src/utils/helper';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly buyPlanService: BuyPlanService,
  ) {}

  @Get('users')
  @Roles('admin')
  async getAllUsers(@Query() query: UserQueryParamsDto) {
    const userData = await this.userService.getAllUserList(query);
    return userData;
  }

  @Get('user/:id')
  @Roles('admin')
  async getUserData(@Param('id') id: string) {
    const userdata = await this.userService.findById(Number(id));
    if (!userdata) {
      throw new NotFoundException({
        status: HttpStatus.NOT_FOUND,
        message: 'User not found',
      });
    }
    const subscription = await this.buyPlanService.findActivePlan(Number(id));
    return { ...excludeFromObject(userdata, ['password']), subscription };
  }
}
