import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  // Prompt 1: Generador de enlace de campaña
  server.prompt(
    'create-campaign-link',
    'Guía interactiva para estructurar y crear un enlace corto para una campaña con UTMs y QR adaptado.',
    {
      campaignName: z.string().describe('Nombre de la campaña comercial o publicitaria'),
      destinationUrl: z.string().url().describe('URL base de la landing page o producto'),
      utmSource: z.string().optional().describe('Fuente de tráfico UTM (ej. newsletter, instagram, flyers)'),
      brandColor: z.string().optional().describe('Color hexadecimal de la marca para el código QR (ej. #1E40AF)'),
    },
    async ({ campaignName, destinationUrl, utmSource, brandColor }) => {
      const source = utmSource || 'marketing_campaign';
      const color = brandColor || '#000000';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Por favor ayúdame a crear un nuevo enlace corto en QR Maker para la campaña "${campaignName}".\n\n` +
                `Detalles de la campaña:\n` +
                `- Destino base: ${destinationUrl}\n` +
                `- Fuente UTM sugerida: ${source}\n` +
                `- Color de marca deseado: ${color}\n\n` +
                `Pasos a seguir:\n` +
                `1. Añade los parámetros UTM adecuados (utm_source, utm_medium, utm_campaign) a la URL de destino.\n` +
                `2. Elige o sugiere un shortCode limpio y legible.\n` +
                `3. Invoca la tool 'create_link' con la configuración de color adecuada.\n` +
                `4. Recupera el QR generado en formato SVG con 'get_qr_code' y muéstrame el resultado.`,
            },
          },
        ],
      };
    },
  );

  // Prompt 2: Auditoría y optimización de tráfico
  server.prompt(
    'audit-link-traffic',
    'Analiza el rendimiento de escaneos de un enlace y genera recomendaciones de conversión y distribución.',
    {
      linkId: z.string().uuid().describe('UUID del enlace a auditar'),
      period: z
        .enum(['7d', '30d', '90d', '365d'])
        .optional()
        .default('7d')
        .describe('Ventana temporal de analítica'),
    },
    async ({ linkId, period }) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Por favor realiza una auditoría completa de tráfico para el enlace con ID "${linkId}" durante el periodo "${period}".\n\n` +
                `Instrucciones:\n` +
                `1. Usa la tool 'get_link_stats' para obtener la telemetría agregada y los desgloses.\n` +
                `2. Consulta el detalle del enlace con 'get_link' para verificar el destino actual.\n` +
                `3. Genera un reporte conciso destacando:\n` +
                `   - Total de clics y visitantes únicos.\n` +
                `   - Top 3 países con mayor interacción.\n` +
                `   - Distribución de plataformas móviles vs de escritorio.\n` +
                `   - Recomendaciones prácticas para aumentar la conversión de escaneos.`,
            },
          },
        ],
      };
    },
  );

  // Prompt 3: Seguimiento de órdenes físicas de hardware
  server.prompt(
    'track-hardware-orders',
    'Consulta y resume el estado de fabricación y despacho de los pedidos físicos de tarjetas PVC y acrílicos NFC.',
    {
      fulfillmentStatus: z
        .enum(['unfulfilled', 'in_production', 'shipped', 'delivered'])
        .optional()
        .describe('Filtrar opcionalmente por estado de manufactura/entrega'),
    },
    async ({ fulfillmentStatus }) => {
      const filterDesc = fulfillmentStatus ? ` en estado "${fulfillmentStatus}"` : '';
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Por favor revisa el estado de mis pedidos físicos de hardware (tarjetas PVC, expositores acrílicos, stickers NFC)${filterDesc}.\n\n` +
                `Instrucciones:\n` +
                `1. Ejecuta la herramienta 'get_hardware_orders' con el filtro correspondiente.\n` +
                `2. Si hay órdenes registradas, presenta una lista clara con:\n` +
                `   - ID de la orden y fecha de creación.\n` +
                `   - Estado de pago ('paid', 'pending', etc.) y estado de manufactura ('in_production', 'shipped', etc.).\n` +
                `   - Ítems comprados (tipo y cantidad).\n` +
                `   - Número de guía o tracking si está disponible.\n` +
                `   - Dirección de entrega.\n` +
                `3. Si alguna orden está en manufactura o despachada, indica un resumen del progreso.`,
            },
          },
        ],
      };
    },
  );
}
