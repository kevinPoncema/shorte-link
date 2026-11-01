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


@Entity('users')
export class User {

  @ApiProperty({
    description: 'Identificador único del usuario (UUID v4)',
    format: 'uuid',
    example: 'a3bb189e-8bf9-3888-9912-ace4e6543002',
  })
  @PrimaryGeneratedColumn('uuid')
  id: string;


  @ApiProperty({
    description: 'Dirección de correo electrónico única del usuario',
    format: 'email',
    example: 'cliente@empresa.com',
  })
  @Index('idx_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true, nullable: false })
  email: string;


  @ApiHideProperty()
  @Column({ type: 'varchar', select: false, nullable: false })
  password: string;


  @ApiProperty({
    description: 'Identificador del plan activo asignado al usuario',
    example: 'DEFAULT',
    nullable: true,
    type: String,
  })
  @Column({ name: 'plan_id', type: 'varchar', length: 50, nullable: true })
  planId: string | null;


  get planTier(): string | null {
    return this.planId;
  }

  set planTier(tier: string | null) {
    this.planId = tier;
  }


  @ApiHideProperty()
  @ManyToOne(() => Plan, (plan) => plan.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'plan_id' })
  plan: Plan | null;


  @ApiHideProperty()
  @OneToMany(() => Link, (link) => link.user)
  links: Link[];


  @ApiProperty({
    description: 'Marca de tiempo de creación de la cuenta (ISO 8601)',
    example: '2026-10-31T22:00:00.000Z',
  })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;


  @ApiProperty({
    description: 'Marca de tiempo de última actualización (ISO 8601)',
    example: '2026-10-31T22:00:00.000Z',
  })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
