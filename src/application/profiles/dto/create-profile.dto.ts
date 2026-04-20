import { IsString, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';

export class CreateProfileDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber()
  @Min(-11)
  @Max(11)
  active!: number;

  @IsNumber()
  @Min(-11)
  @Max(11)
  sensing!: number;

  @IsNumber()
  @Min(-11)
  @Max(11)
  visual!: number;

  @IsNumber()
  @Min(-11)
  @Max(11)
  sequential!: number;
}
