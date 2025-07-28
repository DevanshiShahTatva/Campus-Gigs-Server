import { Controller, Get, Query } from "@nestjs/common";
import { GigsService } from "./gigs.service";
import { GigsQueryParams } from "./gigs.dto";

@Controller('gigsdata')
export class PublicGigsController {
  constructor(private readonly gigsService: GigsService) {}

  @Get('/public')
  getPublicGigs(@Query
    () query: GigsQueryParams) {
    return this.gigsService.get(query);
  }
}
