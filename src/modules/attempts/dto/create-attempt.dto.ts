import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttemptStepDto {
  @ApiProperty({ example: '53 - 26 = 33' })
  @IsString()
  expression!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isFinal!: boolean;
}

export class CreateAttemptDto {
  @ApiProperty()
  @IsString()
  studentId!: string;

  @ApiProperty()
  @IsString()
  skillKey!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty({ type: [AttemptStepDto] })
  @ValidateNested({ each: true })
  @Type(() => AttemptStepDto)
  @IsArray()
  rawSteps!: AttemptStepDto[];

  @ApiProperty({ example: 27 })
  @IsNumber()
  expectedAnswer!: number;

  @ApiProperty({ example: 33 })
  @IsNumber()
  studentAnswer!: number;

  @ApiProperty({ example: 53, required: false })
  @IsOptional()
  @IsNumber()
  minuend?: number;

  @ApiProperty({ example: 26, required: false })
  @IsOptional()
  @IsNumber()
  subtrahend?: number;
}
