import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Link } from './link.entity';

/**
 * Entidad analítica de eventos de clic o escaneo de QR (`link_events`).
 * Diseñada para ingesta asíncrona desde la cola Redis `queue:clicks`.
 *
 * Índice recomendado en producción:
 * `CREATE INDEX idx_link_events_scanned ON link_events(link_id, scanned_at DESC);`
 */
@Entity('link_events')
@Index('idx_link_events_scanned', ['linkId', 'scannedAt'])
export class LinkEvent {
  /**
   * Identificador autoincremental `BigInt` serializado como `string` para preservar precisión de 64 bits.
   */
  @ApiProperty({
    description: 'Identificador BigInt autoincremental del evento',
    example: '1048576',
  })
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  /**
   * Clave foránea indexada hacia el enlace resuelto (`links.id`).
   */
  @ApiProperty({
    description: 'UUID del enlace visitado o escaneado',
    format: 'uuid',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @Index('idx_link_events_link_id')
  @Column({ name: 'link_id', type: 'uuid', nullable: false })
  linkId: string;

  /**
   * Relación `ManyToOne` hacia `Link`.
   */
  @ApiHideProperty()
  @ManyToOne(() => Link, (link) => link.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'link_id' })
  link: Link;

  /**
   * Huella anonimizada (hash SHA-256 truncado con sal) de la dirección IP del visitante.
   */
  @ApiProperty({
    description: 'Dirección IP anonimizada mediante hash SHA-256 con sal',
    example: '9f86d081884c7d659a2feaa0c55ad015',
  })
  @Column({ name: 'ip_address', type: 'varchar', length: 128, nullable: false })
  ipAddress: string;

  /**
   * Cadena `User-Agent` reportada por el cliente HTTP.
   */
  @ApiProperty({
    description: 'Cadena User-Agent del navegador o lector QR',
    example: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    nullable: true,
    type: String,
  })
  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  /**
   * Código de país ISO 3166-1 alpha-2 resuelto por GeoIP.
   */
  @ApiProperty({
    description: 'Código de país ISO-2 (nullable)',
    example: 'MX',
    nullable: true,
    type: String,
  })
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  /**
   * Sistema operativo detectado a partir del `User-Agent`.
   */
  @ApiProperty({
    description: 'Sistema operativo parseado (nullable)',
    example: 'iOS',
    nullable: true,
    type: String,
  })
  @Column({ type: 'varchar', length: 64, nullable: true })
  os: string | null;

  /**
   * Navegador detectado a partir del `User-Agent`.
   */
  @ApiProperty({
    description: 'Navegador detectado (nullable)',
    example: 'Mobile Safari',
    nullable: true,
    type: String,
  })
  @Column({ type: 'varchar', length: 64, nullable: true })
  browser: string | null;

  /**
   * Cabecera `Referer` con la URL de origen de la visita.
   */
  @ApiProperty({
    description: 'URL de referencia (cabecera Referer)',
    example: 'https://linkedin.com',
    nullable: true,
    type: String,
  })
  @Column({ type: 'text', nullable: true })
  referer: string | null;

  /**
   * Marca de tiempo exacta en que ocurrió la redirección o escaneo.
   */
  @ApiProperty({
    description: 'Marca de tiempo del escaneo o clic (ISO 8601)',
    example: '2026-10-31T22:30:00.000Z',
  })
  @Column({
    name: 'scanned_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  scannedAt: Date;
}
