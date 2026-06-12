import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class CreateSubmissionDto {
  @ApiProperty({
    minimum: 1,
    maximum: 3,
    description: 'How many photos of the handwritten work (1-3)',
  })
  @IsInt()
  @Min(1)
  @Max(3)
  photoCount!: number;
}
