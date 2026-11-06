import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { AuthClientService } from '../services/auth-client.service';
import { LinksClientService } from '../services/links-client.service';
import { OrdersClientService } from '../services/orders-client.service';
import { StatsClientService } from '../services/stats-client.service';

export function registerResources(
  server: McpServer,
  authService: AuthClientService,
  linksService: LinksClientService,
  statsService: StatsClientService,
  ordersService: OrdersClientService,
): void {
  // Recurso 1: Perfil de usuario y plan
  server.resource(
    'user-profile',
    'qr://profile',
    {
      description: 'Datos de la cuenta de usuario autenticada, email y plan vigente.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const profile = await authService.getProfile();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(profile, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    },
  );

  // Recurso 2: Lista de enlaces activos
  server.resource(
    'user-links',
    'qr://links',
    {
      description: 'Lista completa de los enlaces y códigos QR creados por el usuario.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const links = await linksService.listLinks({ limit: 50 });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(links, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    },
  );

  // Recurso 3: Plantilla dinámica de analíticas por ID
  server.resource(
    'link-stats-template',
    new ResourceTemplate('qr://links/{id}/stats', { list: undefined }),
    {
      description: 'Analíticas y métricas de tráfico para un enlace específico.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const stats = await statsService.getLinkStats(String(id), '7d');
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    },
  );

  // Recurso 4: Historial de órdenes físicas de hardware
  server.resource(
    'user-orders',
    'qr://orders',
    {
      description: 'Historial de compras de tarjetas PVC, expositores acrílicos y stickers NFC emitidas por el cliente.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const orders = await ordersService.getOrders();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(orders, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    },
  );

  // Recurso 5: Plantilla dinámica de orden física por ID
  server.resource(
    'order-detail-template',
    new ResourceTemplate('qr://orders/{id}', { list: undefined }),
    {
      description: 'Detalle de manufactura, dirección y tracking de una orden física de hardware específica.',
      mimeType: 'application/json',
    },
    async (uri, { id }) => {
      try {
        const order = await ordersService.getOrderById(String(id));
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(order || { error: 'Orden no encontrada' }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    },
  );

  // Recurso 6: Estado de suscripción SaaS
  server.resource(
    'user-subscription',
    'qr://subscription',
    {
      description: 'Detalle de la suscripción SaaS activa del usuario en Stripe.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const sub = await ordersService.getSubscription();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(sub, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: error.message }),
            },
          ],
        };
      }
    },
  );
}
