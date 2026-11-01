import { Inject, Injectable } from '@nestjs/common';
import { User } from '../../models/user.entity';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../interfaces/user-repository.interface';

/**
 * Servicio de dominio de administración de cuentas de usuario (`UsersService`).
 * Exportado por `CoreModule` para permitir operaciones de suscripción
 * y mutación de niveles de plan sin acoplar detalles de persistencia a otros módulos.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  /**
   * Obtiene la entidad de usuario por su identificador UUID.
   */
  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId.trim());
  }

  /**
   * Actualiza el nivel de plan (`planTier` / `planId`) de un usuario.
   * Utilizado durante la sincronización idempotente de Webhooks de pasarelas de pago.
   *
   * @param userId UUID del usuario en el Control Plane.
   * @param tier Nombre del plan asignado (ej. `'PRO'`, `'STARTER'`).
   */
  async updatePlanTier(userId: string, tier: string): Promise<void> {
    await this.userRepository.updatePlanTier(userId.trim(), tier.trim().toUpperCase());
  }
}
