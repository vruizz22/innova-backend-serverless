import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateGuideDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiProperty({
    required: false,
    description: 'Max re-submissions per student',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxResubmissions?: number;

  @ApiProperty({
    required: false,
    description: 'Reveal the solution to the student after grading',
  })
  @IsOptional()
  @IsBoolean()
  showSolutionAfterGrade?: boolean;
}
