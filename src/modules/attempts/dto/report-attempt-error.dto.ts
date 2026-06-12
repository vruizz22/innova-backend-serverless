import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for POST /attempts/:id/report — v8 C4. A student or teacher who disagrees
 * with the classifier picks the correct error tag from the catalog.
 */
export class ReportAttemptErrorDto {
  @ApiProperty({
    description: 'Error tag code from the catalog (e.g. SUB_BORROW_NO_REGROUP)',
  })
  @IsString()
  errorTagCode!: string;

  @ApiProperty({
    required: false,
    description: 'Optional free-text note from the reporter',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
