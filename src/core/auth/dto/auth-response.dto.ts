import { ApiProperty } from '@nestjs/swagger';

/**
 * Representación pública del perfil de usuario autenticado retornada junto con el token JWT.
 */
export class AuthenticatedUserDto {
  @ApiProperty({
    description: 'Identificador único del usuario (UUID v4)',
    format: 'uuid',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  id: string;

  @ApiProperty({
    description: 'Correo electrónico normalizado del usuario',
    format: 'email',
    example: 'cliente@empresa.com',
  })
  email: string;

  @ApiProperty({
    description: 'Clave del plan activo inyectada también dentro del JWT',
    example: 'DEFAULT',
  })
  plan: string;

  @ApiProperty({
    description: 'Fecha de creación de la cuenta (ISO 8601)',
    example: '2026-10-31T22:00:00.000Z',
  })
  createdAt: Date;
}

/**
 * Respuesta estándar emitida tras registro o inicio de sesión exitoso.
 */
export class AuthResponseDto {
  @ApiProperty({
    description:
      'Token JWT stateless firmado con el payload { sub, email, plan, iat, exp }',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhM2JiMTg5ZS04YmY5LTM4ODgtOTkxMi1hY2U0ZTY1NDMwMDIiLCJlbWFpbCI6ImNsaWVudGVAZW1wcmVzYS5jb20iLCJwbGFuIjoiREVGQVVMVCIsImlhdCI6MTczMDQxOTIwMCwiZXhwIjoxNzMwNTA1NjAwfQ.signature',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Datos básicos de la cuenta autenticada',
    type: () => AuthenticatedUserDto,
  })
  user: AuthenticatedUserDto;
}
