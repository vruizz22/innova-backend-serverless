import { IsString, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProfileDto {
  @ApiProperty({
    description: 'The unique user identifier',
    example: 'user-uuid',
  })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    description: 'Active-Reflective tag (-11 to +11)',
    minimum: -11,
    maximum: 11,
    example: 5,
  })
  @IsNumber()
  @Min(-11)
  @Max(11)
  active!: number;

  @ApiProperty({
    description: 'Sensing-Intuitive tag (-11 to +11)',
    minimum: -11,
    maximum: 11,
    example: -3,
  })
  @IsNumber()
  @Min(-11)
  @Max(11)
  sensing!: number;

  @ApiProperty({
    description: 'Visual-Verbal tag (-11 to +11)',
    minimum: -11,
    maximum: 11,
    example: 7,
  })
  @IsNumber()
  @Min(-11)
  @Max(11)
  visual!: number;

  @ApiProperty({
    description: 'Sequential-Global tag (-11 to +11)',
    minimum: -11,
    maximum: 11,
    example: -9,
  })
  @IsNumber()
  @Min(-11)
  @Max(11)
  sequential!: number;
}
