import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsString, ValidateNested } from 'class-validator';

class ItemContentDto {
  @ApiProperty({ example: '53 - 26' })
  @IsString()
  prompt!: string;
}

export class CreateItemDto {
  @ApiProperty()
  @IsString()
  skillId!: string;

  @ApiProperty({ type: ItemContentDto })
  @ValidateNested()
  @Type(() => ItemContentDto)
  @IsObject()
  content!: ItemContentDto;

  @ApiProperty({ example: 1.1 })
  @IsNumber()
  irtA!: number;

  @ApiProperty({ example: -0.25 })
  @IsNumber()
  irtB!: number;
}
