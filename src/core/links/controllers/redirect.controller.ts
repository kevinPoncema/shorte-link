import {
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { LinksService } from '../services/links.service';

/**
 * Controlador público del **Data Plane** (`GET /:shortCode`).
 * Optimizado para latencia sub-milisegundo sin guards de autenticación ni validación de planes.
 */
@ApiTags('Redirect (Fast-Path)')
@Controller()
export class RedirectController {
  constructor(private readonly linksService: LinksService) {}

  /**
   * Resuelve un `shortCode` desde Redis (o PostgreSQL en Cache Miss), encola métricas
   * de forma asíncrona en `queue:clicks` y responde inmediatamente con `HTTP 302 Found`.
   */
  @Get(':shortCode')
  @ApiOperation({
    summary: 'Resolver enlace corto o QR dinámico (HTTP 302 Fast-Path)',
    description:
      'Consulta `GET r:{shortCode}` en Redis. En Cache Hit responde en microsegundos con `302 Found` + `Location` y emite asíncronamente el evento a `LPUSH queue:clicks`. En Cache Miss consulta PostgreSQL, valida `isActive` y repuebla Redis.',
  })
  @ApiParam({
    name: 'shortCode',
    description: 'Slug alfanumérico único del enlace o código QR',
    example: 'aB3x9Kq',
  })
  @ApiFoundResponse({
    description: 'Redirección HTTP 302 inmediata hacia `targetUrl`',
    headers: {
      Location: {
        description: 'URL original de destino configurada en el enlace',
        schema: {
          type: 'string',
          format: 'uri',
          example: 'https://docs.nestjs.com/techniques/performance',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'El código corto no existe o el enlace se encuentra desactivado (`isActive: false`)',
  })
  async redirect(
    @Param('shortCode') shortCode: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (shortCode === 'favicon.ico') {
      throw new NotFoundException();
    }

    const resolved =
      await this.linksService.resolveShortCodeForRedirect(shortCode);

    const userAgentHeader = request.headers['user-agent'];
    const refererHeader =
      request.headers['referer'] ?? request.headers['referrer'];

    this.linksService.recordClickAsync({
      shortCode,
      linkId: resolved.linkId,
      rawIp: request.ip,
      userAgent: Array.isArray(userAgentHeader)
        ? userAgentHeader[0]
        : userAgentHeader,
      referer: Array.isArray(refererHeader) ? refererHeader[0] : refererHeader,
    });

    reply
      .code(HttpStatus.FOUND)
      .header('Location', resolved.targetUrl)
      .send();
  }
}
