import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Extensión tipada de `FastifyRequest` poblada por `JwtAuthGuard` tras validar la firma JWT.
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: JwtPayload;
}

/**
 * Guard stateless nativo para Fastify que verifica tokens `Bearer <JWT>`
 * e inyecta el `JwtPayload` descifrado en `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Valida la cabecera `Authorization: Bearer <token>` y adjunta el payload a `request.user`.
   *
   * @param context Contexto de ejecución HTTP de NestJS.
   * @throws {UnauthorizedException} Si el encabezado falta, está malformado o el JWT es inválido/expirado.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing or malformed authorization token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>(
          'JWT_SECRET',
          'dev-fallback-jwt-secret',
        ),
      });
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired authorization token');
    }
  }

  /**
   * Extrae únicamente el token cuando el esquema HTTP coincide exactamente con `Bearer`.
   */
  private extractTokenFromHeader(request: FastifyRequest): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
