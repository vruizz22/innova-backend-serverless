import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * The teacher may only move a question to APPROVED or EXCLUDED from the wizard.
 * EXTRACTED / NEEDS_REVIEW are pipeline-assigned (ADR-119).
 */
export const TEACHER_SETTABLE_QUESTION_STATUSES = [
  'APPROVED',
  'EXCLUDED',
] as const;
export type TeacherSettableQuestionStatus =
  (typeof TEACHER_SETTABLE_QUESTION_STATUSES)[number];

export class UpdateGuideQuestionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  statementLatex?: string;

  @ApiProperty({ required: false, example: '1.a' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false, example: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  points?: number;

  @ApiProperty({
    required: false,
    description: 'Confirmed curriculum topic (sets topicSource=TEACHER)',
  })
  @IsOptional()
  @IsString()
  topicId?: string;

  @ApiProperty({
    required: false,
    description:
      'Confirmed taxonomy subdomain (sets domainId from it + topicSource=TEACHER). ' +
      'This is the primary classification unit since v9.1.',
  })
  @IsOptional()
  @IsString()
  subdomainId?: string;

  @ApiProperty({
    required: false,
    enum: TEACHER_SETTABLE_QUESTION_STATUSES,
  })
  @IsOptional()
  @IsIn(TEACHER_SETTABLE_QUESTION_STATUSES)
  status?: TeacherSettableQuestionStatus;
}
