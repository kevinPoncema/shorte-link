import { Inject, Injectable } from '@nestjs/common';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../interfaces/subscription-repository.interface';
import { Subscription } from '../models/subscription.entity';

/**
 * Servicio de dominio de facturación (`BillingModule`).
 * Orquesta las consultas de estado de suscripción desacoplado del ORM mediante `ISubscriptionRepository`.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepository: ISubscriptionRepository,
  ) {}

  /**
   * Orquestador de consulta de suscripción por usuario:
   * 1. Normaliza el identificador del usuario.
   * 2. Delega la búsqueda al repositorio de dominio.
   */
  async findByUserId(userId: string): Promise<Subscription | null> {
    const normalizedUserId = this.normalizeUserId(userId);
    return this.fetchSubscriptionRecord(normalizedUserId);
  }

  /**
   * Limpia espacios en blanco del identificador de usuario recibido.
   */
  private normalizeUserId(userId: string): string {
    return userId.trim();
  }

  /**
   * Recupera el registro de suscripción desde la abstracción de persistencia.
   */
  private async fetchSubscriptionRecord(
    userId: string,
  ): Promise<Subscription | null> {
    return this.subscriptionRepository.findByUserId(userId);
  }
}
