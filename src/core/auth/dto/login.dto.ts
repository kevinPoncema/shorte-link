import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Payload de entrada para iniciar sesión y obtener un JWT stateless (`POST /auth/login`).
 */
export class LoginDto {
  /**
   * Correo electrónico registrado de la cuenta.
   */
  @ApiProperty({
    description: 'Correo electrónico de la cuenta registrada',
    format: 'email',
    example: 'cliente@empresa.com',
    maxLength: 255,
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email: string;

  /**
   * Contraseña de la cuenta para verificación contra el hash `bcrypt`.
   */
  @ApiProperty({
    description: 'Contraseña de la cuenta',
    example: 'StrongPassword123!',
    maxLength: 72,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
