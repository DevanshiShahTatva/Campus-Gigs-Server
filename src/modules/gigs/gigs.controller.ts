import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { GigsQueryParams, PostGigsDto } from './gigs.dto';
import { GigsService } from './gigs.service';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { Request } from 'express';
import { FilesInterceptor } from '@nestjs/platform-express';
import { multerOptions } from 'src/utils/multer';

@Controller('gigs')
@UseGuards(JwtAuthGuard)
export class GigsController {
  constructor(private gigsService: GigsService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 5, multerOptions))
  async createGigs(
    @Body() body: PostGigsDto,
    @Req() request: Request,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const user = request.user as any;
    const newBody = {
      ...body,
      user_id: Number(user?.id),
    };
    return this.gigsService.create(newBody, files);
  }

  @Get()
  getGigs(@Query() query: GigsQueryParams) {
    return this.gigsService.get(query);
  }

  @Get('/my-gigs')
  getMyGigs(@Query() query: GigsQueryParams, @Req() request: Request) {
    const user = request.user as any;
    return this.gigsService.getMyGigs(query, user.id);
  }

  @Get(":id")
  getGigById(@Param("id") id: string, @Req() request: Request) {
    const user = request.user as any;
    return this.gigsService.findById(Number(id), Number(user?.id));
  }

  @Put(':id')
  @UseInterceptors(FilesInterceptor('files', 5, multerOptions))
  putGigs(
    @Param('id') id: string,
    @Body() body: PostGigsDto,
    @Req() request: Request,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const user = request.user as any;
    const newBody = {
      ...body,
      user_id: Number(user?.id),
    };
    return this.gigsService.put(Number(id), newBody, files);
  }

  @Delete(':id')
  deleteGigs(@Param('id') id: string) {
    return this.gigsService.delete(Number(id));
  }
}
