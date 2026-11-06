import { ApiClient } from '../client/api-client';
import {
  BillingConfigResponse,
  PhysicalOrderRecord,
  SubscriptionRecord,
} from '../client/types';

export interface HardwareOrdersFilter {
  paymentStatus?: string;
  fulfillmentStatus?: string;
}

export class OrdersClientService {
  constructor(private readonly apiClient: ApiClient) {}

  /**
   * Consulta el historial de órdenes de hardware físico (placas acrílicas, tarjetas PVC, stickers NFC)
   * del usuario autenticado. (GET /billing/orders).
   */
  public async getOrders(filter?: HardwareOrdersFilter): Promise<PhysicalOrderRecord[]> {
    const orders = await this.apiClient.request<PhysicalOrderRecord[]>('/billing/orders', {
      method: 'GET',
    });

    if (!filter) return orders;

    return orders.filter((order) => {
      if (filter.paymentStatus && order.paymentStatus !== filter.paymentStatus) {
        return false;
      }
      if (filter.fulfillmentStatus && order.fulfillmentStatus !== filter.fulfillmentStatus) {
        return false;
      }
      return true;
    });
  }

  /**
   * Obtiene una orden física específica por su UUID buscando en el historial del usuario.
   */
  public async getOrderById(orderId: string): Promise<PhysicalOrderRecord | null> {
    const orders = await this.getOrders();
    const order = orders.find((o) => o.id === orderId);
    return order || null;
  }

  /**
   * Consulta de sólo lectura del estado actual de la suscripción SaaS (GET /billing/subscription).
   */
  public async getSubscription(): Promise<{ subscription: SubscriptionRecord | null }> {
    return this.apiClient.request<{ subscription: SubscriptionRecord | null }>(
      '/billing/subscription',
      { method: 'GET' },
    );
  }

  /**
   * Consulta de sólo lectura de la configuración de catálogo y feature flag de hardware (GET /billing/config).
   */
  public async getBillingConfig(): Promise<BillingConfigResponse> {
    return this.apiClient.request<BillingConfigResponse>('/billing/config', {
      method: 'GET',
    });
  }
}
