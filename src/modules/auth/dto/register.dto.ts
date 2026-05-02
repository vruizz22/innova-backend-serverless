import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '@modules/auth/roles.enum';

export class RegisterDto {
  @ApiProperty({ example: 'student.new@innova.demo' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Innova123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.STUDENT })
  @IsEnum(Role)
  role!: Role;
}
