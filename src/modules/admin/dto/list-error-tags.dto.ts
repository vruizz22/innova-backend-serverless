import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ErrorSource, ErrorStatus } from '@prisma/client';

/**
 * Query for the admin catalog browser (GET /admin/error-tags).
 *
 * All filters are optional. Pagination is keyset (not offset): `cursor` is the
 * `code` of the last row of the previous page and the list is ordered by the
 * unique `code` index, so it stays stable even as the catalog keeps growing.
 */
export class ListErrorTagsDto {
  @IsOptional()
  @IsEnum(ErrorStatus)
  status?: ErrorStatus;

  /** Backend SHORT domain code (e.g. ARITH). Pick from the `domains` facet. */
  @IsOptional()
  @IsString()
  domainCode?: string;

  @IsOptional()
  @IsEnum(ErrorSource)
  source?: ErrorSource;

  /** Case-insensitive substring over code / name / description. */
  @IsOptional()
  @IsString()
  q?: string;

  /** Keyset cursor: the `code` after which to continue. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
