import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum AssignmentReason {
  TEACHER_MANUAL = 'TEACHER_MANUAL',
  PRACTICE_RECOMMENDER = 'PRACTICE_RECOMMENDER',
}

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Course the assignment targets (whole class)' })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiProperty({ description: 'Specific student IDs (subset)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentIds?: string[];

  @ApiProperty({ description: 'Exercise IDs to assign' })
  @IsArray()
  @IsString({ each: true })
  exerciseIds!: string[];

  @ApiProperty({ description: 'Assignment title' })
  @IsString()
  title!: string;

  @ApiProperty({ enum: AssignmentReason })
  @IsEnum(AssignmentReason)
  reason!: AssignmentReason;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
