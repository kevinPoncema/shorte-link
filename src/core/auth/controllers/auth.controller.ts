import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { JWT_BEARER_AUTH } from '../../../openapi.config';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { AuthService } from '../services/auth.service';
import { UsersService } from '../services/users.service';

/**
 * Controlador de autenticación (`POST /auth/register`, `POST /auth/login`, `GET /auth/me`).
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Registra una nueva cuenta de usuario, le asigna el plan `'STARTER'` y retorna su JWT.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo usuario',
    description:
      'Crea una cuenta con contraseña hasheada mediante bcrypt, asigna el plan por defecto (`STARTER`) y emite un token JWT stateless.',
  })
  @ApiCreatedResponse({
    description: 'Cuenta creada exitosamente y token JWT emitido',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Formato de correo inválido, contraseña fuera de rango o propiedades no permitidas',
  })
  @ApiConflictResponse({
    description: 'El correo electrónico ya está registrado',
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * Valida credenciales existentes y emite un token JWT stateless.
   */
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión y obtener token JWT',
    description:
      'Verifica credenciales contra PostgreSQL/bcrypt y firma un JWT con `{ sub, email, plan, iat, exp }`.',
  })
  @ApiOkResponse({
    description: 'Credenciales válidas y token JWT emitido',
    type: AuthResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Payload de entrada inválido',
  })
  @ApiUnauthorizedResponse({
    description: 'Credenciales inválidas (correo inexistente o contraseña incorrecta)',
  })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  /**
   * Obtiene los datos del perfil y plan actual del usuario autenticado.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth(JWT_BEARER_AUTH)
  @ApiOperation({
    summary: 'Consultar información del usuario autenticado',
    description:
      'Devuelve los datos de la cuenta incluyendo su identificador, email y plan vigente en PostgreSQL.',
  })
  @ApiOkResponse({
    description: 'Perfil del usuario recuperado exitosamente',
  })
  @ApiUnauthorizedResponse({
    description: 'Token JWT ausente o inválido',
  })
  async getProfile(@CurrentUser() user: JwtPayload) {
    const userEntity = await this.usersService.findById(user.sub);
    const effectivePlan = userEntity?.planId || user.plan;
    const effectiveEmail = userEntity?.email || user.email;
    const accessToken = await this.authService.issueTokenForUser({
      id: user.sub,
      email: effectiveEmail,
      plan: effectivePlan,
    });

    return {
      id: user.sub,
      email: effectiveEmail,
      plan: effectivePlan,
      createdAt: userEntity?.createdAt,
      accessToken,
    };
  }
}
