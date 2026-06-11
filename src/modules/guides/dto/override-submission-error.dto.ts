import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';

/**
 * Teacher manual override of a submission's error tag (C11). A `null`
 * `errorTagCode` clears a previous override and reverts to the pipeline tag.
 * Mirrors the C4 report flow: the catalog *code* is resolved server-side.
 */
export class OverrideSubmissionErrorDto {
  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Error tag code from the catalog, or null to clear the override',
    example: 'SUB_BORROW_NO_REGROUP',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  errorTagCode?: string | null;
}
