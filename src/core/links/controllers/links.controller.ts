import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { JWT_BEARER_AUTH } from '../../../openapi.config';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { Link } from '../../models/link.entity';
import { CreateLinkDto } from '../dto/create-link.dto';
import { FindLinksQueryDto } from '../dto/find-links-query.dto';
import { LinkStatsResponseDto } from '../dto/link-stats-response.dto';
import { PaginatedLinksResponseDto } from '../dto/paginated-links-response.dto';
import { UpdateLinkDto } from '../dto/update-link.dto';
import { LinkStatsService } from '../services/link-stats.service';
import { LinksService } from '../services/links.service';

/**
 * Controlador autenticado del Control Plane para gestión CRUD de enlaces cortos,
 * analíticas de uso y renderizado de códigos QR dinámicos (`/links`).
 */
@ApiTags('Links & QR')
@ApiBearerAuth(JWT_BEARER_AUTH)
@ApiUnauthorizedResponse({
  description: 'Token JWT ausente, malformado, inválido o expirado',
})
@Controller('links')
@UseGuards(JwtAuthGuard)
export class LinksController {
  constructor(
    private readonly linksService: LinksService,
    @Optional()
    private readonly linkStatsService?: LinkStatsService,
  ) {}

  /**
   * Crea un enlace corto validando las cuotas del plan del usuario y precalienta Redis.
   */
  @Post()
  @ApiOperation({
    summary: 'Crear un nuevo enlace corto y configuración QR',
    description:
      'Evalúa la cuota del plan (`PlanStrategy`), persiste el enlace en PostgreSQL y precalienta `SET r:{shortCode} {targetUrl}` en Redis.',
  })
  @ApiCreatedResponse({
    description: 'Enlace creado y precalentado en caché exitosamente',
    type: Link,
  })
  @ApiBadRequestResponse({
    description: 'URL inválida, shortCode reservado o parámetros QR fuera de rango',
  })
  @ApiForbiddenResponse({
    description: 'Cuota de enlaces alcanzada o personalización de QR no permitida por el plan actual',
  })
  @ApiConflictResponse({
    description: 'El shortCode personalizado ya está en uso',
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateLinkDto,
  ): Promise<Link> {
    return this.linksService.createLink(user, dto);
  }

  /**
   * Lista los enlaces del usuario autenticado, con soporte opcional de paginación y filtros.
   */
  @Get()
  @ApiOperation({
    summary: 'Listar enlaces del usuario autenticado con paginación y filtros opcionales',
    description:
      'Retorna enlaces ordenados descendentemente. Soporta opcionalmente paginación (?page=1&limit=10) y filtro por nombre (?name=...). Si se omite la paginación, retorna el array completo.',
  })
  @ApiOkResponse({
    description: 'Listado de enlaces del usuario (paginado con metadatos o plano)',
  })
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query?: FindLinksQueryDto,
  ): Promise<PaginatedLinksResponseDto | Link[]> {
    return this.linksService.findAllByUser(user.sub, query);
  }

  /**
   * Obtiene el detalle de un enlace específico del usuario autenticado.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener detalle de un enlace por ID',
    description: 'Recupera un enlace verificando que pertenezca al usuario autenticado.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID v4 del enlace',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Detalle del enlace encontrado',
    type: Link,
  })
  @ApiBadRequestResponse({
    description: 'El parámetro id no es un UUID válido',
  })
  @ApiNotFoundResponse({
    description: 'Enlace no encontrado o perteneciente a otra cuenta',
  })
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Link> {
    return this.linksService.findOneByUser(user.sub, id);
  }

  /**
   * Genera la imagen del código QR dinámico en formato `png` o `svg`.
   */
  @Get(':id/qr')
  @ApiOperation({
    summary: 'Renderizar imagen del código QR dinámico',
    description:
      'Genera el código QR apuntando al enlace corto (`{APP_BASE_URL}/{shortCode}`) aplicando `qrConfig`. Permite sobreescribir el formato mediante `?format=png|svg`.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID v4 del enlace',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['png', 'svg'],
    description: 'Formato de salida opcional que sobreescribe `qrConfig.format`',
  })
  @ApiProduces('image/png', 'image/svg+xml')
  @ApiOkResponse({
    description: 'Imagen QR generada en formato binario PNG o vectorial SVG',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiBadRequestResponse({
    description: 'UUID inválido o formato solicitado distinto de png/svg',
  })
  @ApiNotFoundResponse({
    description: 'Enlace no encontrado o perteneciente a otra cuenta',
  })
  async getQrCode(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('format') format: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (format !== undefined && format !== 'png' && format !== 'svg') {
      throw new BadRequestException('format must be either png or svg');
    }

    const qr = await this.linksService.generateQrCode(user.sub, id, format);
    reply.header('Content-Type', qr.contentType).send(qr.data);
  }

  /**
   * Obtiene las estadísticas agregadas (`summary`, `timeline` y `breakdowns`) de un enlace
   * acotadas por la retención del plan activo del usuario (`STARTER`: 7d, `PRO`: hasta 365d).
   */
  @Get(':id/stats')
  @ApiOperation({
    summary: 'Obtener estadísticas y desgloses analíticos de un enlace',
    description:
      'Ejecuta agregaciones optimizadas sobre `link_events` acotadas por la retención del plan (`PlanStrategy.getAnalyticsRetentionDays()`), agrupando el top de sistemas operativos, navegadores, países y fuentes de tráfico más la categoría "Others".',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID v4 del enlace',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    example: '7d',
    description:
      'Ventana de tiempo solicitada (ej. `7d`, `30d`, `90d`, `365d`). Se acota automáticamente al límite máximo del plan del usuario.',
  })
  @ApiOkResponse({
    description: 'Estadísticas agregadas del enlace',
    type: LinkStatsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'UUID inválido o formato de periodo inválido',
  })
  @ApiNotFoundResponse({
    description: 'Enlace no encontrado o perteneciente a otra cuenta',
  })
  async getStats(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('period') period?: string,
  ): Promise<LinkStatsResponseDto> {
    if (!this.linkStatsService) {
      throw new BadRequestException('LinkStatsService is not initialized');
    }
    return this.linkStatsService.getLinkStats(user, id, period);
  }

  /**
   * Actualiza un enlace existente e invalida reactivamente su clave en Redis (`DEL r:{shortCode}`).
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar destino, estado o diseño QR de un enlace',
    description:
      'Actualiza el enlace en PostgreSQL y ejecuta obligatoriamente `DEL r:{shortCode}` en Redis para evitar redirecciones desactualizadas.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID v4 del enlace',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Enlace actualizado y caché invalidada',
    type: Link,
  })
  @ApiBadRequestResponse({
    description: 'UUID inválido o datos de actualización inválidos',
  })
  @ApiForbiddenResponse({
    description: 'Límite de enlaces activos o personalización QR restringida por el plan actual',
  })
  @ApiNotFoundResponse({
    description: 'Enlace no encontrado o perteneciente a otra cuenta',
  })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLinkDto,
  ): Promise<Link> {
    return this.linksService.updateLink(user, id, dto);
  }

  /**
   * Elimina un enlace e invalida inmediatamente su clave en Redis (`DEL r:{shortCode}`).
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar un enlace corto',
    description:
      'Elimina el registro en PostgreSQL y borra reactivamente `DEL r:{shortCode}` en Redis.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identificador UUID v4 del enlace',
    format: 'uuid',
  })
  @ApiNoContentResponse({
    description: 'Enlace eliminado y clave de caché invalidada',
  })
  @ApiBadRequestResponse({
    description: 'El parámetro id no es un UUID válido',
  })
  @ApiNotFoundResponse({
    description: 'Enlace no encontrado o perteneciente a otra cuenta',
  })
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.linksService.deleteLink(user.sub, id);
  }
}
