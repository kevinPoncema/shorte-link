import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  IPlanRepository,
  PLAN_REPOSITORY,
} from '../../../plans/interfaces/plan-repository.interface';
import { User } from '../../models/user.entity';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../interfaces/user-repository.interface';

const PLAN_DEFAULT_NAMES: Record<string, string> = {
  STARTER: 'Plan Starter (Gratuito / Físico)',
  PRO: 'Plan Pro / Premium ($9 - $15/mes)',
  DEFAULT: 'Plan Starter (Gratuito / Físico)',
};

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
    @Optional()
    @Inject(PLAN_REPOSITORY)
    private readonly planRepository?: IPlanRepository,
  ) { }

  /**
   * Obtiene la entidad de usuario por su identificador UUID.
   */
  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId.trim());
  }

  /**
   * Actualiza el nivel de plan (`planTier` / `planId`) de un usuario garantizando
   * previamente de forma idempotente que la clave exista en el catálogo `plans` (integridad FK).
   * Utilizado durante la sincronización idempotente de Webhooks de pasarelas de pago y cambios de plan.
   *
   * @param userId UUID del usuario en el Control Plane.
   * @param tier Nombre del plan asignado (ej. `'PRO'`, `'STARTER'`).
   */
  async updatePlanTier(userId: string, tier: string): Promise<void> {
    const normalizedUserId = userId.trim();
    const normalizedTier = tier.trim().toUpperCase();

    await this.ensurePlanRecordExists(normalizedTier);
    await this.userRepository.updatePlanTier(normalizedUserId, normalizedTier);
  }

  /**
   * Garantiza que el identificador del plan exista en la tabla `plans` antes de asignar `users.plan_id`.
   */
  private async ensurePlanRecordExists(tierId: string): Promise<void> {
    if (!this.planRepository) {
      return;
    }

    const existing = await this.planRepository.findById(tierId);
    if (!existing) {
      await this.planRepository.createAndSave({
        id: tierId,
        name: PLAN_DEFAULT_NAMES[tierId] ?? `Plan ${tierId}`,
        isActive: true,
      });
    }
  }
}
