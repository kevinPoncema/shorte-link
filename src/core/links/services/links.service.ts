import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import { PlanStrategy } from '../../../plans/interfaces/plan-strategy.interface';
import { PlanContextService } from '../../../plans/services/plan-context.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CacheService, ClickEventPayload } from '../../cache/cache.service';
import { Link, QrConfig } from '../../models/link.entity';
import { CreateLinkDto } from '../dto/create-link.dto';
import { UpdateLinkDto } from '../dto/update-link.dto';
import {
  ILinkRepository,
  LINK_REPOSITORY,
} from '../interfaces/link-repository.interface';

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
 * Opciones normalizadas de renderizado para la librería `qrcode`.
 */
interface NormalizedQrRenderOptions {
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
  margin: number;
  width: number;
  color: {
    dark: string;
    light: string;
  };
}

/**
 * Servicio de dominio de gestión de enlaces cortos y códigos QR dinámicos.
 * Diseñado bajo el patrón **Orquestador** y los principios **SOLID** (SRP, OCP, DIP),
 * delegando la persistencia exclusivamente al contrato `ILinkRepository`.
 */
@Injectable()
export class LinksService {
  private readonly logger = new Logger(LinksService.name);

  constructor(
    @Inject(LINK_REPOSITORY)
    private readonly linkRepository: ILinkRepository,
    private readonly planContextService: PlanContextService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  // ===========================================================================
  // Orquestadores de Casos de Uso (Public Business Orchestrators)
  // ===========================================================================

  /**
   * **Orquestador de Creación de Enlace (`POST /links`):**
   * 1. Resuelve la estrategia de plan aplicable al usuario.
   * 2. Verifica el cumplimiento de cuotas (totales, activos y permisos de diseño QR).
   * 3. Resuelve o genera criptográficamente un `shortCode` único.
   * 4. Persiste la nueva entidad de dominio a través del repositorio.
   * 5. Precalienta la caché Redis (`SET r:{shortCode}`).
   */
  async createLink(user: JwtPayload, dto: CreateLinkDto): Promise<Link> {
    const strategy = this.resolvePlanStrategy(user.plan);
    await this.enforceCreationQuotas(user.sub, strategy, dto);

    const shortCode = await this.resolveOrAllocateShortCode(dto.shortCode);
    const savedLink = await this.persistNewLink(user.sub, shortCode, dto);

    await this.warmUpRedirectCache(savedLink);
    return savedLink;
  }

  /**
   * **Orquestador de Listado de Enlaces (`GET /links`):**
   * Recupera todos los enlaces pertenecientes al usuario autenticado en orden descendente.
   */
  async findAllByUser(userId: string): Promise<Link[]> {
    return this.linkRepository.findAllByUser(userId);
  }

  /**
   * **Orquestador de Consulta Individual con Control de Propiedad (`GET /links/:id`):**
   * 1. Consulta el enlace restringiendo por propietario (`userId`).
   * 2. Verifica existencia o lanza `NotFoundException` (prevención IDOR).
   */
  async findOneByUser(userId: string, linkId: string): Promise<Link> {
    const link = await this.linkRepository.findByIdAndUser(linkId, userId);
    this.assertLinkExists(link);
    return link;
  }

  /**
   * **Orquestador de Actualización de Enlace (`PATCH /links/:id`):**
   * 1. Obtiene el enlace validando pertenencia del usuario.
   * 2. Resuelve la estrategia del plan del usuario.
   * 3. Valida las reglas de negocio y aplica las mutaciones parciales sobre la entidad.
   * 4. Guarda la entidad actualizada en el repositorio.
   * 5. Ejecuta invalidación reactiva inmediata en Redis (`DEL r:{shortCode}`).
   */
  async updateLink(
    user: JwtPayload,
    linkId: string,
    dto: UpdateLinkDto,
  ): Promise<Link> {
    const link = await this.findOneByUser(user.sub, linkId);
    const strategy = this.resolvePlanStrategy(user.plan);

    await this.applyAndValidateLinkUpdates(link, dto, user.sub, strategy);
    const updatedLink = await this.linkRepository.save(link);

    await this.invalidateRedirectCache(updatedLink.shortCode);
    return updatedLink;
  }

  /**
   * **Orquestador de Eliminación de Enlace (`DELETE /links/:id`):**
   * 1. Verifica pertenencia y existencia del enlace.
   * 2. Elimina el registro mediante el repositorio de dominio.
   * 3. Invalida reactivamente su entrada en Redis (`DEL r:{shortCode}`).
   */
  async deleteLink(userId: string, linkId: string): Promise<void> {
    const link = await this.findOneByUser(userId, linkId);
    await this.linkRepository.remove(link);
    await this.invalidateRedirectCache(link.shortCode);
  }

  /**
   * **Orquestador de Renderizado de Código QR Dinámico (`GET /links/:id/qr`):**
   * 1. Recupera el enlace verificando propiedad.
   * 2. Construye la URL pública corta a codificar.
   * 3. Determina el formato de salida (`png` o `svg`) y normaliza las opciones visuales.
   * 4. Renderiza el artefacto gráfico correspondiente.
   */
  async generateQrCode(
    userId: string,
    linkId: string,
    formatOverride?: 'png' | 'svg',
  ): Promise<GeneratedQrResult> {
    const link = await this.findOneByUser(userId, linkId);
    const shortUrl = this.buildPublicShortUrl(link.shortCode);
    const format = this.resolveQrFormat(link.qrConfig, formatOverride);
    const qrOptions = this.buildQrRenderOptions(link.qrConfig);

    return this.renderQrByFormat(shortUrl, format, qrOptions);
  }

  /**
   * **Orquestador del Fast-Path de Redirección (`GET /:shortCode`):**
   * 1. Intenta resolver el destino directamente desde memoria RAM (`GET r:{shortCode}`).
   * 2. En caso de *Cache Hit*, retorna inmediatamente el `targetUrl`.
   * 3. En caso de *Cache Miss*, consulta el repositorio, verifica estado activo y repuebla Redis.
   */
  async resolveShortCodeForRedirect(
    shortCode: string,
  ): Promise<ResolvedRedirect> {
    const cachedTarget = await this.cacheService.getRedirectTarget(shortCode);
    if (cachedTarget) {
      return { targetUrl: cachedTarget };
    }

    return this.resolveFromRepositoryAndWarmCache(shortCode);
  }

  /**
   * **Orquestador de Registro Asíncrono de Métricas de Clic:**
   * 1. Construye el payload del evento con IP anonimizada vía SHA-256.
   * 2. Encola de forma no bloqueante (*fire-and-forget*) el evento en `queue:clicks`.
   */
  recordClickAsync(params: {
    shortCode: string;
    linkId?: string;
    rawIp?: string;
    country?: string | null;
    userAgent?: string;
    referer?: string;
  }): void {
    const payload = this.buildClickEventPayload(params);
    this.dispatchClickEventToQueue(payload);
  }

  // ===========================================================================
  // Funciones Auxiliares de Dominio (Single Responsibility Principle)
  // ===========================================================================

  /**
   * Obtiene la estrategia de plan correspondiente al usuario.
   */
  private resolvePlanStrategy(planCode?: string): PlanStrategy {
    return this.planContextService.getStrategy(planCode);
  }

  /**
   * Ejecuta todas las validaciones de cuota y permisos de plan previas a crear un enlace.
   */
  private async enforceCreationQuotas(
    userId: string,
    strategy: PlanStrategy,
    dto: Pick<CreateLinkDto, 'qrConfig' | 'customDomain'>,
  ): Promise<void> {
    await this.assertTotalLinksQuota(userId, strategy);
    await this.assertActiveLinksQuota(userId, strategy);
    this.assertQrCustomizationAllowed(dto.qrConfig, strategy);
    this.assertCustomDomainAllowed(dto.customDomain, strategy);
  }

  /**
   * Verifica que el usuario no haya superado el número total de enlaces permitidos por su plan.
   */
  private async assertTotalLinksQuota(
    userId: string,
    strategy: PlanStrategy,
  ): Promise<void> {
    const totalUserLinks = await this.linkRepository.countByUser(userId);
    strategy.assertCanCreateLink(totalUserLinks);
  }

  /**
   * Verifica que el usuario no supere el límite de enlaces activos simultáneos de su plan.
   */
  private async assertActiveLinksQuota(
    userId: string,
    strategy: PlanStrategy,
  ): Promise<void> {
    const maxActiveLinks = strategy.getMaxActiveLinks();
    if (!Number.isFinite(maxActiveLinks)) {
      return;
    }

    const activeUserLinks = await this.linkRepository.countActiveByUser(userId);
    if (activeUserLinks >= maxActiveLinks) {
      throw new ForbiddenException(
        `Maximum active links quota (${maxActiveLinks}) reached for plan ${strategy.tierName}`,
      );
    }
  }

  /**
   * Comprueba si el plan permite personalizar el diseño del código QR cuando se envían opciones no estándar.
   */
  private assertQrCustomizationAllowed(
    qrConfig: QrConfig | undefined,
    strategy: PlanStrategy,
  ): void {
    if (
      this.hasCustomQrDesignParameters(qrConfig) &&
      !strategy.canCustomizeQrDesign()
    ) {
      throw new ForbiddenException(
        `Custom QR design is not available on plan ${strategy.tierName}`,
      );
    }
  }

  /**
   * Determina si la configuración QR contiene parámetros personalizados distintos al blanco y negro estándar.
   */
  private hasCustomQrDesignParameters(qrConfig?: QrConfig): boolean {
    if (!qrConfig || Object.keys(qrConfig).length === 0) {
      return false;
    }

    const hasCustomForeground =
      qrConfig.foregroundColor !== undefined &&
      qrConfig.foregroundColor.toUpperCase() !== '#000000';
    const hasCustomBackground =
      qrConfig.backgroundColor !== undefined &&
      qrConfig.backgroundColor.toUpperCase() !== '#FFFFFF';
    const hasCustomLogo = Boolean(qrConfig.logoUrl);
    const hasOtherCustomOptions =
      qrConfig.format !== undefined ||
      qrConfig.margin !== undefined ||
      qrConfig.width !== undefined ||
      qrConfig.errorCorrectionLevel !== undefined;

    return (
      hasCustomForeground ||
      hasCustomBackground ||
      hasCustomLogo ||
      hasOtherCustomOptions
    );
  }

  /**
   * Comprueba si el plan permite configurar un subdominio CNAME propio.
   */
  private assertCustomDomainAllowed(
    customDomain: string | undefined,
    strategy: PlanStrategy,
  ): void {
    if (
      customDomain &&
      customDomain.trim().length > 0 &&
      !strategy.canUseCustomDomain()
    ) {
      throw new ForbiddenException(
        `Custom domain (CNAME) is not available on plan ${strategy.tierName}`,
      );
    }
  }

  /**
   * Decide si validar un `shortCode` personalizado o generar uno aleatorio único.
   */
  private async resolveOrAllocateShortCode(
    customShortCode?: string,
  ): Promise<string> {
    return customShortCode
      ? this.validateCustomShortCode(customShortCode)
      : this.generateUniqueShortCode();
  }

  /**
   * Construye y guarda la nueva entidad `Link` a través del repositorio de dominio.
   */
  private async persistNewLink(
    userId: string,
    shortCode: string,
    dto: CreateLinkDto,
  ): Promise<Link> {
    return this.linkRepository.createAndSave({
      shortCode,
      name: this.normalizeLinkName(dto.name),
      targetUrl: dto.targetUrl,
      isActive: true,
      qrConfig: dto.qrConfig ?? {},
      userId,
    });
  }

  /**
   * Normaliza el nombre de referencia opcional de un enlace.
   */
  private normalizeLinkName(name?: string | null): string | null {
    if (!name) {
      return null;
    }
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Precalienta la clave de redirección en Redis (`SET r:{shortCode} {targetUrl}`).
   */
  private async warmUpRedirectCache(
    link: Pick<Link, 'shortCode' | 'targetUrl'>,
  ): Promise<void> {
    await this.cacheService.setRedirectTarget(link.shortCode, link.targetUrl);
  }

  /**
   * Invalida reactivamente la clave de redirección en Redis (`DEL r:{shortCode}`).
   */
  private async invalidateRedirectCache(shortCode: string): Promise<void> {
    await this.cacheService.invalidateRedirectTarget(shortCode);
  }

  /**
   * Afirma que la entidad `Link` exista o lanza `NotFoundException`.
   */
  private assertLinkExists(link: Link | null): asserts link is Link {
    if (!link) {
      throw new NotFoundException('Link not found');
    }
  }

  /**
   * Valida y aplica cada campo modificado del DTO sobre la entidad de dominio `Link`.
   */
  private async applyAndValidateLinkUpdates(
    link: Link,
    dto: UpdateLinkDto,
    userId: string,
    strategy: PlanStrategy,
  ): Promise<void> {
    if (dto.customDomain !== undefined) {
      this.assertCustomDomainAllowed(dto.customDomain, strategy);
    }

    if (dto.qrConfig !== undefined) {
      this.applyQrConfigUpdate(link, dto.qrConfig, strategy);
    }

    if (dto.isActive !== undefined) {
      await this.applyActiveStatusUpdate(link, dto.isActive, userId, strategy);
    }

    if (dto.name !== undefined) {
      link.name = this.normalizeLinkName(dto.name);
    }

    if (dto.targetUrl !== undefined) {
      link.targetUrl = dto.targetUrl;
    }
  }

  /**
   * Valida permisos de diseño QR y fusiona la nueva configuración visual en el enlace.
   */
  private applyQrConfigUpdate(
    link: Link,
    qrConfig: QrConfig,
    strategy: PlanStrategy,
  ): void {
    this.assertQrCustomizationAllowed(qrConfig, strategy);
    link.qrConfig = { ...link.qrConfig, ...qrConfig };
  }

  /**
   * Valida la cuota de enlaces activos al reactivar un enlace inactivo y actualiza su estado.
   */
  private async applyActiveStatusUpdate(
    link: Link,
    nextIsActive: boolean,
    userId: string,
    strategy: PlanStrategy,
  ): Promise<void> {
    if (nextIsActive && !link.isActive) {
      await this.assertActiveLinksQuota(userId, strategy);
    }
    link.isActive = nextIsActive;
  }

  /**
   * Construye la URL corta pública completa usando `APP_BASE_URL`.
   */
  private buildPublicShortUrl(shortCode: string): string {
    const baseUrl = this.configService
      .get<string>('APP_BASE_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    return `${baseUrl}/${shortCode}`;
  }

  /**
   * Determina el formato final del código QR priorizando el query param sobre `qrConfig`.
   */
  private resolveQrFormat(
    config?: QrConfig,
    formatOverride?: 'png' | 'svg',
  ): 'png' | 'svg' {
    return formatOverride ?? config?.format ?? 'png';
  }

  /**
   * Normaliza las opciones visuales y de corrección de errores para el motor QR.
   */
  private buildQrRenderOptions(config?: QrConfig): NormalizedQrRenderOptions {
    const safeConfig = config ?? {};
    return {
      errorCorrectionLevel: safeConfig.errorCorrectionLevel ?? 'M',
      margin: safeConfig.margin ?? 2,
      width: safeConfig.width ?? 300,
      color: {
        dark: safeConfig.foregroundColor ?? '#000000',
        light: safeConfig.backgroundColor ?? '#FFFFFF',
      },
    };
  }

  /**
   * Ejecuta la generación vectorial (`svg`) o matricial (`png`) del código QR.
   */
  private async renderQrByFormat(
    shortUrl: string,
    format: 'png' | 'svg',
    qrOptions: NormalizedQrRenderOptions,
  ): Promise<GeneratedQrResult> {
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
   * Resuelve un *Cache Miss* consultando el repositorio, validando que esté activo
   * y repoblando Redis para futuras peticiones.
   */
  private async resolveFromRepositoryAndWarmCache(
    shortCode: string,
  ): Promise<ResolvedRedirect> {
    const link = await this.linkRepository.findByShortCodeForRedirect(shortCode);

    if (!link || !link.isActive) {
      throw new NotFoundException('Link not found');
    }

    await this.warmUpRedirectCache(link);

    return {
      targetUrl: link.targetUrl,
      linkId: link.id,
    };
  }

  /**
   * Construye el objeto de evento de clic con IP anonimizada y marca de tiempo ISO.
   */
  private buildClickEventPayload(params: {
    shortCode: string;
    linkId?: string;
    rawIp?: string;
    country?: string | null;
    userAgent?: string;
    referer?: string;
  }): ClickEventPayload {
    return {
      shortCode: params.shortCode,
      linkId: params.linkId,
      ipAddress: this.anonymizeIp(params.rawIp ?? '0.0.0.0'),
      country: params.country ?? null,
      userAgent: params.userAgent ?? null,
      referer: params.referer ?? null,
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Encola el evento de clic en Redis de manera asíncrona registrando advertencias si falla.
   */
  private dispatchClickEventToQueue(payload: ClickEventPayload): void {
    void this.cacheService.enqueueClickEvent(payload).catch((error: unknown) => {
      this.logger.warn(
        `Failed to enqueue click event for ${payload.shortCode}: ${(error as Error).message}`,
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
    if (this.isReservedSlug(shortCode)) {
      throw new BadRequestException('This shortCode is reserved');
    }

    const exists = await this.linkRepository.existsByShortCode(shortCode);
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
      if (this.isReservedSlug(candidate)) {
        continue;
      }

      const exists = await this.linkRepository.existsByShortCode(candidate);
      if (!exists) {
        return candidate;
      }
    }

    throw new InternalServerErrorException(
      'Unable to allocate a unique shortCode after multiple retries',
    );
  }

  /**
   * Comprueba si un candidato coincide con una palabra reservada del sistema.
   */
  private isReservedSlug(slug: string): boolean {
    return RESERVED_SLUGS.has(slug.toLowerCase());
  }

  /**
   * Genera una cadena aleatoria Base62 de la longitud indicada.
   */
  private generateRandomBase62(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += BASE62_ALPHABET[randomInt(0, BASE62_ALPHABET.length)];
    }
    return result;
  }
}
