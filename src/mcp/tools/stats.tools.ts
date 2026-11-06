import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StatsClientService } from '../services/stats-client.service';

export function registerStatsTools(server: McpServer, statsService: StatsClientService): void {
  // Tool: Obtener analíticas y telemetría
  server.tool(
    'get_link_stats',
    'Obtiene métricas y analíticas agregadas de escaneos de un enlace (total de clics, visitantes únicos, serie temporal y desgloses por SO, navegadores, países y fuentes).',
    {
      id: z.string().uuid().describe('Identificador UUID v4 del enlace'),
      period: z
        .enum(['7d', '30d', '90d', '365d'])
        .optional()
        .default('7d')
        .describe(
          'Ventana de tiempo para el análisis (7d, 30d, 90d, 365d). Se acota automáticamente al límite del plan del usuario (7 días en STARTER, hasta 365 días en PRO).',
        ),
    },
    async ({ id, period }) => {
      try {
        const stats = await statsService.getLinkStats(id, period);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al obtener analíticas para el enlace '${id}': ${error.message}` }],
        };
      }
    },
  );
}
