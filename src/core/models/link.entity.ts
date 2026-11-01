import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LinkEvent } from './link-event.entity';
import { User } from './user.entity';

/**
 * Parámetros visuales y de codificación almacenados en `jsonb` para el renderizado
 * dinámico del código QR asociado a un `Link`.
 */
export interface QrConfig {
  foregroundColor?: string;
  backgroundColor?: string;
  logoUrl?: string;
  format?: 'png' | 'svg';
  margin?: number;
  width?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

@Entity('links')
export class Link {
  @ApiProperty({
    description: 'Identificador único del enlace (UUID v4)',
    format: 'uuid',
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;


  @ApiProperty({
    description: 'Código alfanumérico corto único (6 a 16 caracteres)',
    example: 'aB3x9Kq',
  })
  @Index('idx_links_short_code', { unique: true })
  @Column({
    name: 'short_code',
    type: 'varchar',
    length: 16,
    unique: true,
    nullable: false,
  })
  shortCode: string;


  @ApiPropertyOptional({
    description: 'Nombre descriptivo o de referencia para identificar el enlace',
    example: 'Campaña Black Friday 2026',
    maxLength: 150,
    nullable: true,
    type: String,
  })
  @Column({ name: 'name', type: 'varchar', length: 150, nullable: true })
  name: string | null;


  @ApiProperty({
    description: 'URL absoluta de destino (HTTP/HTTPS)',
    format: 'uri',
    example: 'https://docs.nestjs.com/techniques/performance',
  })
  @Column({ name: 'target_url', type: 'text', nullable: false })
  targetUrl: string;

  @ApiProperty({
    description: 'Indica si el enlace está activo para redirección pública',
    example: true,
    default: true,
  })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;


  @ApiProperty({
    description: 'Parámetros JSONB de personalización del código QR',
    example: {
      foregroundColor: '#000000',
      backgroundColor: '#FFFFFF',
      format: 'svg',
      margin: 2,
      width: 300,
      errorCorrectionLevel: 'M',
    },
  })
  @Column({
    name: 'qr_config',
    type: 'jsonb',
    nullable: false,
    default: () => "'{}'::jsonb",
  })
  qrConfig: QrConfig;


  @ApiProperty({
    description: 'UUID del usuario propietario del enlace',
    format: 'uuid',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @Index('idx_links_user_id')
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;


  @ApiHideProperty()
  @ManyToOne(() => User, (user) => user.links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;


  @ApiHideProperty()
  @OneToMany(() => LinkEvent, (event) => event.link)
  events: LinkEvent[];

  @ApiProperty({
    description: 'Fecha de creación del enlace (ISO 8601)',
    example: '2026-10-31T22:15:00.000Z',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ApiProperty({
    description: 'Fecha de última actualización del enlace (ISO 8601)',
    example: '2026-10-31T22:20:00.000Z',
  })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
