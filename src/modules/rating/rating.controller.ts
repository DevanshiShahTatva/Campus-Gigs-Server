import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { RatingService } from './rating.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ChallengeComplaintDto, DeputeQueryParams, RatingDto, ResolveDeputeGigDto } from './rating.dto';

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

  @Post("challenge-complaint")
  async challengeComplaint(@Body() body: ChallengeComplaintDto, @Req() request: Request) {
    const user = request.user as any;
    return this.ratingService.challengeComplaint(body, user?.id);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get("/get-depute-gigs")
  async getAllDeputeGigs(@Query() query: DeputeQueryParams) {
    return this.ratingService.getAllDeputeGigs(query);
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("/mark-under-review/:complaintId")
  async markUnderReviewGig(@Param('complaintId') complaintId: string) {
    return this.ratingService.markUnderReviewGig(Number(complaintId));
  }

  @Roles('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post("/mark-dispute-resolved/:complaintId")
  async resolveDeputeGig(@Param('complaintId') complaintId: string, @Body() body: ResolveDeputeGigDto) {
    return this.ratingService.resolveDeputeGig(Number(complaintId), body);
  }
}