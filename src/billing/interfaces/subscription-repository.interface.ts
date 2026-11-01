import { Subscription } from '../models/subscription.entity';

/**
 * Token de inyección de dependencias para el repositorio de suscripciones (`ISubscriptionRepository`).
 * Implementa el Principio de Inversión de Dependencias (SOLID - DIP).
 */
export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');

/**
 * Contrato de repositorio de dominio para la entidad `Subscription`.
 * Desacopla `BillingService` de TypeORM.
 */
export interface ISubscriptionRepository {
  /**
   * Obtiene la suscripción activa o histórica vinculada al identificador único de un usuario.
   */
  findByUserId(userId: string): Promise<Subscription | null>;
}
