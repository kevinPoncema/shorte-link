import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Detalle de la dirección y contacto para el despacho físico.
 */
export class ShippingAddressDto {
  @ApiProperty({
    description: 'Nombre completo del destinatario',
    example: 'Juan Pérez',
  })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({
    description: 'Línea principal de dirección de entrega',
    example: 'Barrio Guamilito, 5ta Calle',
  })
  @IsString()
  @IsNotEmpty()
  addressLine1: string;

  @ApiPropertyOptional({
    description: 'Línea secundaria de dirección (apartamento, edificio, etc.)',
    example: 'Apto 4B',
  })
  @IsString()
  @IsOptional()
  addressLine2?: string;

  @ApiProperty({
    description: 'Ciudad de destino',
    example: 'San Pedro Sula',
  })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({
    description: 'Estado, departamento o provincia',
    example: 'Cortés',
  })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({
    description: 'Código postal',
    example: '21101',
  })
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Código de país ISO',
    example: 'HN',
  })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({
    description: 'Número telefónico de contacto',
    example: '+50499999999',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({
    description: 'Instrucciones especiales para el repartidor',
    example: 'Dejar con el vigilante en caseta',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

/**
 * Especificación de un insumo físico a fabricar y enviar.
 */
export class PhysicalOrderItemDto {
  @ApiPropertyOptional({
    description: 'UUID del enlace dinámico a vincular/grabar en el QR (opcional)',
    format: 'uuid',
    example: 'b1b22e11-897c-48c9-9eb1-8848db929c8e',
  })
  @IsUUID()
  @IsOptional()
  linkId?: string;

  @ApiProperty({
    description: 'Tipo de insumo físico solicitado',
    example: 'acrylic_stand',
    enum: ['acrylic_stand', 'nfc_sticker'],
  })
  @IsString()
  @IsNotEmpty()
  itemType: string;

  @ApiProperty({
    description: 'Cantidad de unidades solicitadas (> 0)',
    minimum: 1,
    example: 2,
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    description: 'Atributos de personalización (color, logoUrl, dimensiones)',
    example: { color: 'matte_black', size: '10x15' },
  })
  @IsObject()
  @IsOptional()
  specifications?: Record<string, any>;
}

/**
 * DTO para registrar un pedido de hardware físico y generar sesión de pago (`POST /billing/checkout/physical`).
 */
export class CreatePhysicalOrderCheckoutDto {
  @ApiProperty({
    description: 'Lista de insumos físicos solicitados',
    type: [PhysicalOrderItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PhysicalOrderItemDto)
  items: PhysicalOrderItemDto[];

  @ApiProperty({
    description: 'Información de envío y contacto',
    type: ShippingAddressDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;

  @ApiPropertyOptional({
    description: 'URL de retorno tras completar el pago (Requerido para Stripe)',
    example: 'https://midominio.com/orders/success',
  })
  @IsUrl({ require_tld: false })
  @IsOptional()
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'URL de retorno si el usuario cancela la orden (Requerido para Stripe)',
    example: 'https://midominio.com/orders/cancelled',
  })
  @IsUrl({ require_tld: false })
  @IsOptional()
  cancelUrl?: string;
}
