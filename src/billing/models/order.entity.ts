import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderItem } from './order-item.entity';

/**
 * Estados del pago de una orden física.
 */
export type OrderPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

/**
 * Estados del proceso de manufactura y despacho físico.
 */
export type OrderFulfillmentStatus =
  | 'unfulfilled'
  | 'in_production'
  | 'shipped'
  | 'delivered';

/**
 * Estructura de la dirección de envío del pedido.
 */
export interface ShippingAddressData {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone: string;
  notes?: string;
}

/**
 * Entidad de orden de compra física (`orders`).
 * Registra solicitudes de compra de insumos de hardware (placas acrílicas, stickers NFC).
 */
@Entity('orders')
export class Order {
  /**
   * Identificador interno único universal (UUID v4) de la orden.
   */
  @ApiProperty({
    description: 'Identificador único de la orden (UUID v4)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * UUID del cliente que realiza la compra.
   */
  @ApiProperty({
    description: 'UUID del usuario comprador',
    format: 'uuid',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @Index('idx_orders_user_id')
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /**
   * Identificador de transacción en Stripe (`pi_...` o `cs_...`).
   */
  @ApiProperty({
    description: 'ID de transacción de Stripe (PaymentIntent o CheckoutSession)',
    example: 'cs_test_a1b2c3d4e5',
    nullable: true,
    type: String,
  })
  @Index('idx_orders_provider_payment_intent_id', { unique: true })
  @Column({
    name: 'provider_payment_intent_id',
    type: 'varchar',
    length: 255,
    unique: true,
    nullable: true,
  })
  providerPaymentIntentId: string | null;

  /**
   * Monto total a cobrar.
   */
  @ApiProperty({
    description: 'Monto total de la orden',
    example: 35.0,
    type: Number,
  })
  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        value !== null && value !== undefined ? Number(value) : value,
    },
  })
  totalAmount: number;

  /**
   * Código de moneda ISO 4217 (ej. USD, HNL).
   */
  @ApiProperty({
    description: 'Código ISO de la divisa',
    example: 'USD',
    default: 'USD',
  })
  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  /**
   * Estado del cobro del pedido.
   */
  @ApiProperty({
    description: 'Estado de pago de la orden',
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
    example: 'pending',
  })
  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 32,
    default: 'pending',
  })
  paymentStatus: OrderPaymentStatus;

  /**
   * Estado de despacho y manufactura de los artículos físicos.
   */
  @ApiProperty({
    description: 'Estado de cumplimiento del pedido físico',
    enum: ['unfulfilled', 'in_production', 'shipped', 'delivered'],
    default: 'unfulfilled',
    example: 'unfulfilled',
  })
  @Column({
    name: 'fulfillment_status',
    type: 'varchar',
    length: 32,
    default: 'unfulfilled',
  })
  fulfillmentStatus: OrderFulfillmentStatus;

  /**
   * Estructura JSON con los datos del destinatario y entrega.
   */
  @ApiProperty({
    description: 'Datos de contacto y destino de envío',
    nullable: true,
    example: {
      fullName: 'Juan Pérez',
      addressLine1: 'Barrio Guamilito, 5ta Calle',
      city: 'San Pedro Sula',
      phone: '+50499999999',
    },
  })
  @Column({ name: 'shipping_address', type: 'jsonb', nullable: true })
  shippingAddress: ShippingAddressData | null;

  /**
   * Colección de artículos incluidos en este pedido.
   */
  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  /**
   * Fecha de creación del registro.
   */
  @ApiProperty({
    description: 'Fecha y hora de creación de la orden (ISO 8601)',
    example: '2026-11-01T00:00:00.000Z',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Fecha de última modificación del registro.
   */
  @ApiProperty({
    description: 'Fecha y hora de última actualización (ISO 8601)',
    example: '2026-11-01T00:00:00.000Z',
  })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
