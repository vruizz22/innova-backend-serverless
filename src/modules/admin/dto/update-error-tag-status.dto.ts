import { IsEnum } from 'class-validator';
import { ErrorStatus } from '@prisma/client';

/** Body for PATCH /admin/error-tags/:code/status — promote / deprecate a tag. */
export class UpdateErrorTagStatusDto {
  @IsEnum(ErrorStatus)
  status!: ErrorStatus;
}
