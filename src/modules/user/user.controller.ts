import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { UserService } from './user.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserQueryParamsDto } from './user.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('admin/users')
  @Roles("admin")
  async getAllUsers(@Query() query: UserQueryParamsDto) {
    const userData = await this.userService.getAllUserList(query);
    return userData;
  }
}
