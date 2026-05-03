import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'teacher@innova.demo' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Innova123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
