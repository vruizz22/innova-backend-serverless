import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Teacher edit of a question's solution. `stepsJson` is the canonical
 * source-of-truth (ADR-118) and is deep-validated by `canonicalSolutionSchema`
 * in the service. Each edit creates GuideSolution version+1, isCurrent=true,
 * source=TEACHER_EDITED.
 */
export class UpdateGuideSolutionDto {
  @ApiProperty({ example: '27' })
  @IsString()
  finalAnswer!: string;

  @ApiProperty({
    description: 'Canonical solution object (ADR-118)',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  stepsJson!: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Derived render — regenerated, not source of truth',
  })
  @IsOptional()
  @IsString()
  solutionLatex?: string;

  @ApiProperty({
    required: false,
    description: 'ErrorTag codes this question is designed to surface',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expectedErrorTags?: string[];
}
