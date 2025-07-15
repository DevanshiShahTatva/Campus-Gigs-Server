import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { RatingService } from './rating.service';
import { RatingDto } from './rating.dto';

@Controller('rating')
@UseGuards(JwtAuthGuard)
export class RatingController {
  constructor(private ratingService: RatingService) { }

  @Post("create")
  async createRating(@Body() body: RatingDto, @Req() request: Request) {
    const user = request.user as any;
    return this.ratingService.create(body, user?.id);
  }

  @Get("get-by-gig/:gigId")
  async getRatingAndComplaintByGigId(@Param() param: { gigId: string }) {
    return this.ratingService.getRatingAndComplaintByGigId(Number(param.gigId));
  }
}