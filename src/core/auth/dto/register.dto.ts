import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Payload de entrada para el registro de un nuevo usuario (`POST /auth/register`).
 */
export class RegisterDto {
  /**
   * Correo electrónico único del usuario. Se normaliza automáticamente en minúsculas y sin espacios laterales.
   */
  @ApiProperty({
    description: 'Dirección de correo electrónico válida y única',
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
   * Contraseña en texto plano (entre 8 y 72 caracteres, límite nativo de `bcrypt`).
   */
  @ApiProperty({
    description: 'Contraseña segura de la cuenta (8 a 72 caracteres)',
    example: 'StrongPassword123!',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
