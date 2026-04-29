import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ProfilesService } from '@/application/profiles/profiles.service';
import { CreateProfileDto } from '@/application/profiles/dto/create-profile.dto';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async createOrUpdateProfile(@Body() dto: CreateProfileDto) {
    const profile = await this.profilesService.createOrUpdateProfile(dto);
    return {
      message: 'Profile created/updated successfully',
      data: profile,
    };
  }

  @Get(':userId')
  async getProfile(@Param('userId') userId: string) {
    const profile = await this.profilesService.getProfileByUserId(userId);
    return {
      message: 'Profile retrieved successfully',
      data: profile,
    };
  }
}
