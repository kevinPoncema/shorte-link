import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/**
 * DTO para activar o desactivar dinámicamente el módulo de pedidos físicos mediante un flag booleano.
 */
export class TogglePhysicalOrdersDto {
  @ApiProperty({
    description: 'Flag booleano para habilitar (`true`) o deshabilitar (`false`) pedidos físicos',
    example: true,
  })
  @IsBoolean()
  enabled: boolean;
}
