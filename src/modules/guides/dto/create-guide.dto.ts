import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateGuideDto {
  @ApiProperty({ description: 'Course the guide belongs to' })
  @IsString()
  @IsNotEmpty()
  courseId!: string;

  @ApiProperty({ example: 'Guía 3 — Fracciones' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    required: false,
    description: 'Original PDF filename, used to infer the S3 content type',
  })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiProperty({ required: false, description: 'ISO date the guide is due' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
