import { Order } from '../models/order.entity';

/**
 * Token de inyección de dependencias para el repositorio de órdenes (`IOrderRepository`).
 */
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

/**
 * Contrato de repositorio de dominio para la entidad `Order`.
 */
export interface IOrderRepository {
  /**
   * Busca una orden por su identificador UUID, incluyendo sus ítems relacionados.
   */
  findById(id: string): Promise<Order | null>;

  /**
   * Busca una orden por su ID de transacción de pasarela (`providerPaymentIntentId`).
   */
  findByPaymentIntentId(paymentIntentId: string): Promise<Order | null>;

  /**
   * Crea y guarda una nueva orden con sus ítems en cascada.
   */
  createAndSave(order: Partial<Order>): Promise<Order>;

  /**
   * Actualiza los campos de una orden existente.
   */
  update(id: string, partial: Partial<Order>): Promise<void>;
}
