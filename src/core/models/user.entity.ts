import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
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
import { Plan } from '../../plans/models/plan.entity';
import { Link } from './link.entity';

/**
 * Entidad de usuario del Control Plane (`users`).
 * Almacena credenciales autenticables (hash `bcrypt` excluido por defecto en lecturas)
 * y la referencia al plan activo que gobierna sus cuotas en `PlansModule`.
 */
@Entity('users')
export class User {
  /**
   * Identificador único universal (UUID v4) del usuario.
   */
  @ApiProperty({
    description: 'Identificador único del usuario (UUID v4)',
    format: 'uuid',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Correo electrónico único normalizado en minúsculas.
   */
  @ApiProperty({
    description: 'Dirección de correo electrónico única del usuario',
    format: 'email',
    example: 'cliente@empresa.com',
  })
  @Index('idx_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  email: string;

  /**
   * Hash `bcrypt` de la contraseña. Configurado con `select: false` para evitar
   * exposición accidental en consultas convencionales.
   */
  @ApiHideProperty()
  @Column({ type: 'varchar', select: false, nullable: false })
  password: string;

  /**
   * Clave foránea hacia el identificador del plan activo (`plans.id`).
   */
  @ApiProperty({
    description: 'Identificador del plan activo asignado al usuario',
    example: 'DEFAULT',
    nullable: true,
    type: String,
  })
  @Column({ name: 'plan_id', type: 'varchar', length: 50, nullable: true })
  planId: string | null;

  /**
   * Relación `ManyToOne` con la definición del plan.
   */
  @ApiHideProperty()
  @ManyToOne(() => Plan, (plan) => plan.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan | null;

  /**
   * Colección de enlaces cortos y códigos QR pertenecientes al usuario.
   */
  @ApiHideProperty()
  @OneToMany(() => Link, (link) => link.user)
  links: Link[];

  /**
   * Fecha y hora de creación del registro.
   */
  @ApiProperty({
    description: 'Marca de tiempo de creación de la cuenta (ISO 8601)',
    example: '2026-10-31T22:00:00.000Z',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Fecha y hora de la última actualización del registro.
   */
  @ApiProperty({
    description: 'Marca de tiempo de última actualización (ISO 8601)',
    example: '2026-10-31T22:00:00.000Z',
  })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
