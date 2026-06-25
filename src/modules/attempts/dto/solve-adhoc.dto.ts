import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SolveAdhocDto {
  @ApiProperty({ description: 'Student profile id' })
  @IsString()
  studentId!: string;

  @ApiProperty({
    description: 'LaTeX string of the problem statement (from OCR)',
  })
  @IsString()
  problemLatex!: string;

  @ApiProperty({
    type: [String],
    description: 'LaTeX strings for each intermediate step the student wrote',
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  studentSteps?: string[];

  @ApiProperty({
    description: "Student's final answer (may be symbolic, e.g. x=2)",
  })
  @IsString()
  studentFinalAnswer!: string;

  @ApiProperty({
    required: false,
    description: 'Course id (for mastery context)',
  })
  @IsOptional()
  @IsString()
  courseId?: string;

  @ApiProperty({
    required: false,
    description: 'Grade level (1–12). Defaults to 7 when not known.',
    minimum: 1,
    maximum: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;
}

export interface SolveAdhocResponse {
  /** Attempt id — poll GET /attempts/:id/status for the classification result. */
  attemptId: string;
}
