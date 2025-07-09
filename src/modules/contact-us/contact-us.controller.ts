import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Param,
  Query,
  Put,
  ParseIntPipe,
  Req,
} from '@nestjs/common';

// services
import { ContactUsService } from './contact-us.service';

// dto
import {
  CreateContactUsDto,
  UpdateContactUsStatusDto,
  BulkDeleteContactUsDto,
  ContactUsQueryParams,
  GenerateContactUsResponseDto,
} from './contact-us.dto';

// schema
import { JwtAuthGuard } from 'src/common/guards/jwt.auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

@Controller('contact-us')
export class ContactUsController {
  constructor(private readonly contactUsService: ContactUsService) {}

  @Post()
  async create(@Body() dto: CreateContactUsDto) {
    return this.contactUsService.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAll(@Query() query: ContactUsQueryParams) {
    return this.contactUsService.findAll(query);
  }

  @Get('my-requests')
  @UseGuards(JwtAuthGuard)
  async getMyRequests(@Req() req) {
    return this.contactUsService.findByUserEmail(req.user.email);
  }

  @Put(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateContactUsStatusDto,
  ) {
    return this.contactUsService.updateStatus(id, updateStatusDto);
  }

  @Post('bulk-delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteMany(@Body() bulkDeleteDto: BulkDeleteContactUsDto) {
    return this.contactUsService.deleteMany(bulkDeleteDto.ids);
  }

  @Post('generate-response')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async generateResponse(
    @Body() generateContactUsResponseDto: GenerateContactUsResponseDto,
  ) {
    return this.contactUsService.generateContactUsResponse(
      generateContactUsResponseDto,
    );
  }
}
