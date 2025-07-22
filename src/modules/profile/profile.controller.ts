import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { ProfileService } from './profile.service';
import { ProfileUpdateDto } from './profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerOptions } from 'src/utils/multer';
import { Request } from 'express';
import { UserFromToken } from '../shared/userFromToken.service';

@Controller('user/profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    @Inject() private profileService: ProfileService,
    @Inject() private userFromToken: UserFromToken,
  ) {}

  @Get('')
  getProfile(@Req() request: Request) {
    const userId = this.userFromToken.getUserIdFromToken(request);
    return this.profileService.getProfile(userId);
  }

  @Get('public/:id')
  @UseGuards() // Remove guards for public access
  getProviderProfile(@Req() request: Request) {
    // Extract id from params
    const id = request.params.id;
    return this.profileService.getProviderProfile(id);
  }

  @Put('')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  updateProfile(
    @Req() request: Request,
    @Body() body: ProfileUpdateDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = this.userFromToken.getUserIdFromToken(request);
    return this.profileService.updateProfile(userId, body, file);
  }

  @Put('')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  updateProfilePhoto(
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = this.userFromToken.getUserIdFromToken(request);
    return this.profileService.updateProfilePhoto(userId, file);
  }

  @Delete('')
  deleteProfilePhoto(@Req() request: Request) {
    const userId = this.userFromToken.getUserIdFromToken(request);
    return this.profileService.deleteProfilePhoto(userId);
  }
}
