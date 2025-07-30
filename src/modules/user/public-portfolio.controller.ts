import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('')
export class PublicPortfolioController {
  constructor(private readonly userService: UserService) {}
  
  @Get('portfolios/top')
  async getTopPortfolios() {
    return this.userService.findTopPortfolios();
  }
  @Put('user/:id/notification-preferences')
  @Roles('user')
  async updateNotificationPreferences(
    @Param('id') id: string,
    @Body()
    preferences: {
      show_chat?: boolean;
      show_bid?: boolean;
      show_payment?: boolean;
      show_rating?: boolean;
    },
  ) {
    const updated = await this.userService.updateNotificationPreferences(
      Number(id),
      preferences,
    );
    return { message: 'Notification preferences updated', data: updated };
  }
}
