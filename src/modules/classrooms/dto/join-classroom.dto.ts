import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinClassroomDto {
  @ApiProperty({ description: 'Invitation code' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
