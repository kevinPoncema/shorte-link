import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { OrdersClientService } from '../services/orders-client.service';

export function registerOrdersTools(server: McpServer, ordersService: OrdersClientService): void {
  // Tool: Consultar historial de órdenes físicas de hardware (GET /billing/orders)
  server.tool(
    'get_hardware_orders',
    'Consulta el historial de compras de insumos físicos (tarjetas PVC, expositores acrílicos, stickers NFC) emitidas por el usuario.',
    {
      paymentStatus: z
        .enum(['pending', 'paid', 'failed', 'refunded'])
        .optional()
        .describe('Filtrar por estado de pago de la orden (pending, paid, failed, refunded)'),
      fulfillmentStatus: z
        .enum(['unfulfilled', 'in_production', 'shipped', 'delivered'])
        .optional()
        .describe(
          'Filtrar por estado de manufactura y despacho (unfulfilled, in_production, shipped, delivered)',
        ),
    },
    async (filter) => {
      try {
        const orders = await ordersService.getOrders(filter);
        if (orders.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No se encontraron órdenes de hardware físico con los criterios solicitados.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(orders, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error al consultar historial de órdenes físicas: ${error.message}`,
            },
          ],
        };
      }
    },
  );

  // Tool: Obtener detalle de una orden física por ID
  server.tool(
    'get_hardware_order_detail',
    'Obtiene los detalles completos de una orden física de hardware por su identificador UUID (dirección de envío, ítems, tracking, estado).',
    {
      id: z.string().uuid().describe('Identificador UUID v4 de la orden física'),
    },
    async ({ id }) => {
      try {
        const order = await ordersService.getOrderById(id);
        if (!order) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Orden física con ID '${id}' no encontrada en la cuenta del usuario.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(order, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error al consultar orden física '${id}': ${error.message}`,
            },
          ],
        };
      }
    },
  );

  // Tool: Consultar estado actual de la suscripción SaaS (sólo lectura)
  server.tool(
    'get_subscription_status',
    'Consulta el estado de la suscripción SaaS recurrente vinculada a la cuenta (plan, periodo de facturación, estado en Stripe). Nota: Esta herramienta es de sólo lectura.',
    {},
    async () => {
      try {
        const sub = await ordersService.getSubscription();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(sub, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error al consultar suscripción: ${error.message}`,
            },
          ],
        };
      }
    },
  );

  // Tool: Consultar catálogo y disponibilidad de hardware físico (sólo lectura)
  server.tool(
    'get_hardware_catalog_config',
    'Consulta si el módulo de pedidos físicos está activo en el servidor y los precios vigentes de tarjetas PVC, acrílicos y stickers NFC.',
    {},
    async () => {
      try {
        const config = await ordersService.getBillingConfig();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(config, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error al consultar configuración de hardware: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}
