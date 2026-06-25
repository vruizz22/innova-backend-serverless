import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateClassroomDto {
  @ApiProperty({
    description: 'Classroom name (auto-derived from level+letter if omitted)',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Classroom description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Grade level (1–12, where 9–12 = I–IV Medio)',
    minimum: 1,
    maximum: 12,
  })
  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  gradeLevel?: number;

  @ApiPropertyOptional({ description: 'Course letter (A–D)' })
  @IsString()
  @IsOptional()
  letter?: string;

  @ApiPropertyOptional({ description: 'Subject code (defaults to MATH)' })
  @IsString()
  @IsOptional()
  subjectCode?: string;
}
