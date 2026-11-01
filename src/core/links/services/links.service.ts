import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { PlanContextService } from '../../../plans/services/plan-context.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CacheService } from '../../cache/cache.service';
import { Link } from '../../models/link.entity';
import { CreateLinkDto } from '../dto/create-link.dto';
import { UpdateLinkDto } from '../dto/update-link.dto';

const BASE62_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DEFAULT_SHORT_CODE_LENGTH = 7;
const MAX_COLLISION_RETRIES = 5;

/**
 * Conjunto de slugs reservados del sistema para impedir colisiones entre enlaces cortos
 * y rutas administrativas o de documentación OpenAPI.
 */
export const RESERVED_SLUGS = new Set([
  'auth',
  'links',
  'plans',
  'billing',
  'health',
  'metrics',
  'docs',
  'docs-json',
  'docs-yaml',
  'openapi',
  'openapi.json',
  'swagger',
  'favicon.ico',
]);

/**
 * Resultado de la resolución de un `shortCode` en el Fast-Path de redirección.
 */
export interface ResolvedRedirect {
  /** URL de destino hacia donde redirigir con `HTTP 302 Found`. */
  targetUrl: string;
  /** Identificador UUID del enlace cuando provino de un Cache Miss en PostgreSQL. */
  linkId?: string;
}

/**
 * Artefacto generado al renderizar el código QR dinámico de un enlace.
 */
export interface GeneratedQrResult {
  /** Cabecera MIME (`image/png` o `image/svg+xml`). */
  contentType: string;
  /** Buffer binario PNG o cadena XML SVG. */
  data: Buffer | string;
}

/**
 * Servicio central de gestión de enlaces cortos, renderizado de códigos QR dinámicos,
 * sincronización con la caché Redis (`r:{shortCode}`) y registro asíncrono de métricas.
 */
@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);

  constructor(
    @InjectRepository(Link)
    private readonly linksRepository: Repository<Link>,
    private readonly planContextService: PlanContextService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Crea un nuevo enlace corto aplicando las reglas de cuota y personalización
   * definidas por la `PlanStrategy` del usuario, y precalienta Redis (`SET r:{shortCode}`).
   *
   * @param user Payload JWT del usuario autenticado.
   * @param dto Parámetros de creación del enlace y configuración QR.
   */
  async createLink(user: JwtPayload, dto: CreateLinkDto): Promise<Link> {
    const strategy = this.planContextService.getStrategy(user.plan);
    const totalUserLinks = await this.linksRepository.count({
      where: { userId: user.sub },
    });

    strategy.assertCanCreateLink(totalUserLinks);

    const maxActiveLinks = strategy.getMaxActiveLinks();
    if (Number.isFinite(maxActiveLinks)) {
      const activeUserLinks = await this.linksRepository.count({
        where: { userId: user.sub, isActive: true },
      });
      if (activeUserLinks >= maxActiveLinks) {
        throw new ForbiddenException(
          `Maximum active links quota (${maxActiveLinks}) reached for plan ${strategy.tierName}`,
        );
      }
    }

    if (
      dto.qrConfig &&
      Object.keys(dto.qrConfig).length > 0 &&
      !strategy.canCustomizeQrDesign()
    ) {
      throw new ForbiddenException(
        `Custom QR design is not available on plan ${strategy.tierName}`,
      );
    }

    const shortCode = dto.shortCode
      ? await this.validateCustomShortCode(dto.shortCode)
      : await this.generateUniqueShortCode();

    const link = this.linksRepository.create({
      shortCode,
      name: dto.name ? dto.name.trim() : null,
      targetUrl: dto.targetUrl,
      isActive: true,
      qrConfig: dto.qrConfig ?? {},
      userId: user.sub,
    });

    const savedLink = await this.linksRepository.save(link);

    // Precalentamiento en Redis: SET r:{shortCode} {targetUrl}
    await this.cacheService.setRedirectTarget(
      savedLink.shortCode,
      savedLink.targetUrl,
    );

    return savedLink;
  }

  /**
   * Lista todos los enlaces pertenecientes al usuario autenticado en orden cronológico inverso.
   */
  async findAllByUser(userId: string): Promise<Link[]> {
    return this.linksRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Obtiene un enlace verificando pertenencia estricta al usuario solicitante.
   *
   * @throws {NotFoundException} Si el enlace no existe o pertenece a otro usuario.
   */
  async findOneByUser(userId: string, linkId: string): Promise<Link> {
    const link = await this.linksRepository.findOne({
      where: { id: linkId, userId },
    });

    if (!link) {
      throw new NotFoundException('Link not found');
    }

    return link;
  }

  /**
   * Actualiza destino, estado o diseño QR de un enlace en PostgreSQL y ejecuta
   * invalidación reactiva obligatoria (`DEL r:{shortCode}`) en Redis.
   */
  async updateLink(
    user: JwtPayload,
    linkId: string,
    dto: UpdateLinkDto,
  ): Promise<Link> {
    const link = await this.findOneByUser(user.sub, linkId);
    const strategy = this.planContextService.getStrategy(user.plan);

    if (dto.qrConfig !== undefined) {
      if (
        Object.keys(dto.qrConfig).length > 0 &&
        !strategy.canCustomizeQrDesign()
      ) {
        throw new ForbiddenException(
          `Custom QR design is not available on plan ${strategy.tierName}`,
        );
      }
      link.qrConfig = { ...link.qrConfig, ...dto.qrConfig };
    }

    if (dto.isActive !== undefined) {
      if (dto.isActive && !link.isActive) {
        const maxActiveLinks = strategy.getMaxActiveLinks();
        if (Number.isFinite(maxActiveLinks)) {
          const activeUserLinks = await this.linksRepository.count({
            where: { userId: user.sub, isActive: true },
          });
          if (activeUserLinks >= maxActiveLinks) {
            throw new ForbiddenException(
              `Maximum active links quota (${maxActiveLinks}) reached for plan ${strategy.tierName}`,
            );
          }
        }
      }
      link.isActive = dto.isActive;
    }

    if (dto.name !== undefined) {
      link.name = dto.name ? dto.name.trim() : null;
    }

    if (dto.targetUrl !== undefined) {
      link.targetUrl = dto.targetUrl;
    }

    const updatedLink = await this.linksRepository.save(link);

    // Invalidación reactiva obligatoria: DEL r:{shortCode}
    await this.cacheService.invalidateRedirectTarget(updatedLink.shortCode);

    return updatedLink;
  }

  /**
   * Elimina el enlace de PostgreSQL e invalida inmediatamente `DEL r:{shortCode}` en Redis.
   */
  async deleteLink(userId: string, linkId: string): Promise<void> {
    const link = await this.findOneByUser(userId, linkId);
    const { shortCode } = link;

    await this.linksRepository.remove(link);

    // Invalidación reactiva obligatoria: DEL r:{shortCode}
    await this.cacheService.invalidateRedirectTarget(shortCode);
  }

  /**
   * Renderiza bajo demanda el código QR dinámico apuntando a `{APP_BASE_URL}/{shortCode}`
   * aplicando los parámetros almacenados en `qrConfig`.
   */
  async generateQrCode(
    userId: string,
    linkId: string,
    formatOverride?: 'png' | 'svg',
  ): Promise<GeneratedQrResult> {
    const link = await this.findOneByUser(userId, linkId);
    const baseUrl = this.configService
      .get<string>('APP_BASE_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    const shortUrl = `${baseUrl}/${link.shortCode}`;

    const config = link.qrConfig ?? {};
    const format = formatOverride ?? config.format ?? 'png';
    const qrOptions = {
      errorCorrectionLevel: config.errorCorrectionLevel ?? 'M',
      margin: config.margin ?? 2,
      width: config.width ?? 300,
      color: {
        dark: config.foregroundColor ?? '#000000',
        light: config.backgroundColor ?? '#FFFFFF',
      },
    } as const;

    if (format === 'svg') {
      const svg = await QRCode.toString(shortUrl, {
        ...qrOptions,
        type: 'svg',
      });
      return {
        contentType: 'image/svg+xml',
        data: svg,
      };
    }

    const buffer = await QRCode.toBuffer(shortUrl, {
      ...qrOptions,
      type: 'png',
    });

    return {
      contentType: 'image/png',
      data: buffer,
    };
  }

  /**
   * Resuelve un `shortCode` para el Data Plane público:
   * 1. Intenta lectura en RAM (`GET r:{shortCode}`).
   * 2. En caso de *Cache Miss*, consulta PostgreSQL, valida `isActive === true` y puebla Redis.
   *
   * @throws {NotFoundException} Si el código no existe o el enlace está inactivo.
   */
  async resolveShortCodeForRedirect(
    shortCode: string,
  ): Promise<ResolvedRedirect> {
    const cachedTarget = await this.cacheService.getRedirectTarget(shortCode);
    if (cachedTarget) {
      return { targetUrl: cachedTarget };
    }
    const link = await this.linksRepository.findOne({
      select: ['id', 'shortCode', 'targetUrl', 'isActive'],
      where: { shortCode },
    });

    if (!link || !link.isActive) {
      throw new NotFoundException('Link not found');
    }

    await this.cacheService.setRedirectTarget(link.shortCode, link.targetUrl);

    return {
      targetUrl: link.targetUrl,
      linkId: link.id,
    };
  }

  /**
   * Encola de forma asíncrona (*fire-and-forget*) un evento de clic/escaneo en `queue:clicks`
   * anonimizando previamente la IP mediante SHA-256 con sal para no penalizar la respuesta `302`.
   */
  recordClickAsync(params: {
    shortCode: string;
    linkId?: string;
    rawIp?: string;
    userAgent?: string;
    referer?: string;
  }): void {
    const ipAddress = this.anonymizeIp(params.rawIp ?? '0.0.0.0');

    void this.cacheService
      .enqueueClickEvent({
        shortCode: params.shortCode,
        linkId: params.linkId,
        ipAddress,
        userAgent: params.userAgent ?? null,
        referer: params.referer ?? null,
        scannedAt: new Date().toISOString(),
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to enqueue click event for ${params.shortCode}: ${(error as Error).message}`,
        );
      });
  }

  /**
   * Anonimiza irreversiblemente una dirección IP con SHA-256 + `IP_HASH_SALT`.
   */
  private anonymizeIp(ip: string): string {
    const salt = this.configService.get<string>(
      'IP_HASH_SALT',
      'default-ip-anonymization-salt',
    );
    return createHash('sha256')
      .update(`${salt}:${ip}`)
      .digest('hex')
      .slice(0, 32);
  }

  /**
   * Valida que un `shortCode` personalizado no colisione con rutas reservadas ni con enlaces existentes.
   */
  private async validateCustomShortCode(shortCode: string): Promise<string> {
    if (RESERVED_SLUGS.has(shortCode.toLowerCase())) {
      throw new BadRequestException('This shortCode is reserved');
    }

    const exists = await this.linksRepository.exists({
      where: { shortCode },
    });

    if (exists) {
      throw new ConflictException('shortCode is already in use');
    }

    return shortCode;
  }

  /**
   * Genera un código Base62 criptográficamente aleatorio de 7 caracteres con reintentos ante colisión.
   */
  private async generateUniqueShortCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt++) {
      const candidate = this.generateRandomBase62(DEFAULT_SHORT_CODE_LENGTH);
      if (RESERVED_SLUGS.has(candidate.toLowerCase())) {
        continue;
      }

      const exists = await this.linksRepository.exists({
        where: { shortCode: candidate },
      });

      if (!exists) {
        return candidate;
      }
    }

    throw new InternalServerErrorException(
      'Unable to allocate a unique shortCode after multiple retries',
    );
  }

  private generateRandomBase62(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += BASE62_ALPHABET[randomInt(0, BASE62_ALPHABET.length)];
    }
    return result;
  }
}
