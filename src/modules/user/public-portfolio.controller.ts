import { Controller, Get } from '@nestjs/common';
import { UserService } from '../user/user.service';

@Controller('portfolios')
export class PublicPortfolioController {
  constructor(private readonly userService: UserService) {}

  @Get('top')
  async getTopPortfolios() {
    return this.userService.findTopPortfolios();
  }
}
