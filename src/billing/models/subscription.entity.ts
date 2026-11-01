import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../core/models/user.entity';

/**
 * Estados válidos del ciclo de vida de una suscripción en la pasarela de pagos.
 */
export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'trialing'
  | 'incomplete';

/**
 * Entidad de suscripción de facturación (`subscriptions`).
 * Mantiene una relación `1:1` con `User` para sincronización con webhooks de pasarela.
 */
@Entity('subscriptions')
export class Subscription {
  /**
   * Identificador único universal (UUID v4) de la suscripción.
   */
  @ApiProperty({
    description: 'Identificador único de la suscripción (UUID v4)',
    format: 'uuid',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * UUID del usuario titular de la suscripción (clave foránea única).
   */
  @ApiProperty({
    description: 'UUID del usuario titular de la suscripción',
    format: 'uuid',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @Index('idx_subscriptions_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'uuid', unique: true, nullable: false })
  userId: string;

  /**
   * Relación `OneToOne` hacia la entidad `User`.
   */
  @ApiHideProperty()
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /**
   * Nombre de la pasarela de pagos activa (ej. 'STRIPE', 'PIXELPAY').
   */
  @ApiProperty({
    description: 'Nombre de la pasarela de pago externa',
    example: 'STRIPE',
    default: 'STRIPE',
  })
  @Column({
    name: 'provider_name',
    type: 'varchar',
    length: 32,
    default: 'STRIPE',
    nullable: false,
  })
  providerName: string;

  /**
   * Identificador del cliente en la pasarela de pago externa (ej. `cus_...` en Stripe).
   */
  @ApiProperty({
    description: 'ID del cliente en el proveedor de pagos (cus_...)',
    example: 'cus_Qo12abcXYZ',
  })
  @Index('idx_subscriptions_provider_customer_id')
  @Column({
    name: 'provider_customer_id',
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  providerCustomerId: string;

  /**
   * Identificador de la suscripción en la pasarela de pago externa (ej. `sub_...`).
   */
  @ApiProperty({
    description: 'ID de suscripción en la pasarela externa (sub_...)',
    example: 'sub_1Q0abcXYZ',
    nullable: true,
    type: String,
  })
  @Index('idx_subscriptions_provider_subscription_id', { unique: true })
  @Column({
    name: 'provider_subscription_id',
    type: 'varchar',
    length: 255,
    unique: true,
    nullable: true,
  })
  providerSubscriptionId: string | null;

  /**
   * Identificador del precio o plan en la pasarela externa (ej. `price_...`).
   */
  @ApiProperty({
    description: 'ID del precio/plan en la pasarela externa (price_...)',
    example: 'price_1OtXYZ1234567890',
    nullable: true,
    type: String,
  })
  @Column({
    name: 'provider_price_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerPriceId: string | null;

  /**
   * Estado vigente de cobro de la suscripción.
   */
  @ApiProperty({
    description: 'Estado actual de la suscripción',
    enum: ['active', 'canceled', 'past_due', 'trialing', 'incomplete'],
    example: 'incomplete',
    default: 'incomplete',
  })
  @Column({ type: 'varchar', length: 32, default: 'incomplete' })
  status: SubscriptionStatus;

  /**
   * Inicio del ciclo de facturación actual.
   */
  @ApiProperty({
    description: 'Inicio del ciclo de facturación actual (ISO 8601)',
    example: '2026-11-01T00:00:00.000Z',
    nullable: true,
    type: Date,
  })
  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart: Date | null;

  /**
   * Fecha de corte o renovación del período de facturación actual.
   */
  @ApiProperty({
    description: 'Fecha de término del ciclo de facturación vigente (ISO 8601)',
    example: '2026-12-01T00:00:00.000Z',
    nullable: true,
    type: Date,
  })
  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date | null;

  /**
   * Indica si el usuario canceló la autorrenovación al final del ciclo.
   */
  @ApiProperty({
    description: 'Indica si el usuario canceló la renovación automática',
    example: false,
    default: false,
  })
  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  /**
   * Fecha de creación del registro de suscripción.
   */
  @ApiProperty({
    description: 'Marca de tiempo de creación (ISO 8601)',
    example: '2026-10-31T22:00:00.000Z',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Fecha de última modificación del registro de suscripción.
   */
  @ApiProperty({
    description: 'Marca de tiempo de última actualización (ISO 8601)',
    example: '2026-10-31T22:00:00.000Z',
  })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
