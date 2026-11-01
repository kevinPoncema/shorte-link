import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { User } from '../../core/models/user.entity';

/**
 * Entidad de catálogo de planes de suscripción (`plans`).
 * Define las categorías activas a las que puede pertenecer una cuenta de usuario
 * y cuyo identificador (`id`) se enlaza con la estrategia de negocio en `PlanContextService`.
 */
@Entity('plans')
export class Plan {
  /**
   * Identificador único del plan (slug alfanumérico en mayúsculas, ej. `'DEFAULT'`, `'FREE'`, `'PRO'`).
   */
  @ApiProperty({
    description: 'Slug identificador único del plan de suscripción',
    example: 'DEFAULT',
    maxLength: 50,
  })
  @PrimaryColumn({ type: 'varchar', length: 50 })
  id: string;

  /**
   * Nombre comercial o descriptivo del nivel de suscripción.
   */
  @ApiProperty({
    description: 'Nombre descriptivo del plan',
    example: 'Default',
    maxLength: 100,
  })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  /**
   * Indica si el plan se encuentra habilitado para asignación a cuentas.
   */
  @ApiProperty({
    description: 'Estado de disponibilidad del plan',
    example: true,
    default: true,
  })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /**
   * Usuarios asociados a este plan de suscripción.
   */
  @ApiHideProperty()
  @OneToMany(() => User, (user) => user.plan)
  users: User[];
}
