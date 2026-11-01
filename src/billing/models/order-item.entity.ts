import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';

/**
 * Entidad de detalle de artículo en una orden física (`order_items`).
 */
@Entity('order_items')
@Check('"quantity" > 0')
export class OrderItem {
  /**
   * Identificador interno único universal (UUID v4) del ítem.
   */
  @ApiProperty({
    description: 'Identificador único del ítem (UUID v4)',
    format: 'uuid',
    example: '660e8400-e29b-41d4-a716-446655440001',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Clave foránea hacia la cabecera de la orden.
   */
  @ApiProperty({
    description: 'UUID de la orden a la que pertenece este ítem',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @Index('idx_order_items_order_id')
  @Column({ name: 'order_id', type: 'uuid', nullable: false })
  orderId: string;

  /**
   * Relación `ManyToOne` hacia la cabecera `Order`.
   */
  @ApiHideProperty()
  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  /**
   * Enlace del Core que se imprimirá o vinculará en el QR (opcional).
   */
  @ApiProperty({
    description: 'UUID del enlace dinámico asociado al código QR impreso',
    format: 'uuid',
    nullable: true,
    example: 'b1b22e11-897c-48c9-9eb1-8848db929c8e',
    type: String,
  })
  @Index('idx_order_items_link_id')
  @Column({ name: 'link_id', type: 'uuid', nullable: true })
  linkId: string | null;

  /**
   * Tipo de insumo físico (ej. 'acrylic_stand', 'nfc_sticker').
   */
  @ApiProperty({
    description: 'Tipo de insumo físico solicitado',
    example: 'acrylic_stand',
  })
  @Column({ name: 'item_type', type: 'varchar', length: 64, nullable: false })
  itemType: string;

  /**
   * Cantidad solicitada (> 0).
   */
  @ApiProperty({
    description: 'Cantidad de unidades solicitadas',
    minimum: 1,
    example: 2,
  })
  @Column({ type: 'int', nullable: false })
  quantity: number;

  /**
   * Precio unitario congelado al momento de crear la orden.
   */
  @ApiProperty({
    description: 'Precio unitario fijado por el backend al momento de la orden',
    example: 15.0,
    type: Number,
  })
  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) =>
        value !== null && value !== undefined ? Number(value) : value,
    },
  })
  unitPrice: number;

  /**
   * Especificaciones y atributos personalizados (color, tamaño, logotipo).
   */
  @ApiProperty({
    description: 'Atributos de personalización del insumo físico',
    nullable: true,
    example: { color: 'matte_black', size: '10x15', logoUrl: 'https://...' },
  })
  @Column({ type: 'jsonb', nullable: true })
  specifications: Record<string, any> | null;
}
