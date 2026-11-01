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
   * Obtiene la suscripción vinculada al identificador único de un usuario.
   */
  findByUserId(userId: string): Promise<Subscription | null>;

  /**
   * Obtiene la suscripción vinculada al identificador del cliente en Stripe (`providerCustomerId`).
   */
  findByCustomerId(customerId: string): Promise<Subscription | null>;

  /**
   * Obtiene la suscripción vinculada al ID de suscripción en Stripe (`providerSubscriptionId`).
   */
  findBySubscriptionId(subscriptionId: string): Promise<Subscription | null>;

  /**
   * Guarda o actualiza una entidad de suscripción en base de datos.
   */
  save(subscription: Partial<Subscription>): Promise<Subscription>;

  /**
   * Inserta o actualiza de manera idempotente la suscripción para el usuario indicado.
   */
  upsert(subscription: Partial<Subscription>): Promise<Subscription>;
}
