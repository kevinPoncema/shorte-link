import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './client/api-client';
import { loadMcpConfig } from './config/mcp.config';
import { registerPrompts } from './prompts/qr.prompts';
import { registerResources } from './resources/links.resources';
import { AuthClientService } from './services/auth-client.service';
import { LinksClientService } from './services/links-client.service';
import { OrdersClientService } from './services/orders-client.service';
import { StatsClientService } from './services/stats-client.service';
import { registerAuthTools } from './tools/auth.tools';
import { registerLinksTools } from './tools/links.tools';
import { registerOrdersTools } from './tools/orders.tools';
import { registerStatsTools } from './tools/stats.tools';

/**
 * Servidor MCP para Dynamic QR & Link Shortener Platform.
 * Se comunica exclusivamente vía stdio con clientes MCP (Claude Desktop, Cursor, Antigravity, etc.)
 * y actúa como cliente HTTP autenticado hacia la API REST del proyecto.
 */
async function bootstrap(): Promise<void> {
  const config = loadMcpConfig();

  console.error('[QR-Maker MCP] Inicializando servidor...');
  console.error(`[QR-Maker MCP] URL de la API objetivo: ${config.apiBaseUrl}`);

  // 1. Capa de cliente HTTP y repositorios de servicios
  const apiClient = new ApiClient(config);
  const authService = new AuthClientService(apiClient);
  const linksService = new LinksClientService(apiClient);
  const statsService = new StatsClientService(apiClient);
  const ordersService = new OrdersClientService(apiClient);

  // 2. Servidor MCP
  const server = new McpServer({
    name: 'qr-maker-mcp',
    version: '1.0.0',
  });

  // 3. Registro de primitivas
  registerAuthTools(server, authService);
  registerLinksTools(server, linksService);
  registerStatsTools(server, statsService);
  registerOrdersTools(server, ordersService);
  registerResources(server, authService, linksService, statsService, ordersService);
  registerPrompts(server);

  // 4. Conexión sobre transporte stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[QR-Maker MCP] Servidor conectado y escuchando sobre stdio.');
  if (config.defaultEmail) {
    console.error(`[QR-Maker MCP] Credenciales automáticas detectadas para: ${config.defaultEmail}`);
  } else if (config.defaultToken) {
    console.error('[QR-Maker MCP] Bearer Token pre-configurado detectado.');
  } else {
    console.error('[QR-Maker MCP] Sin credenciales iniciales. Utiliza la herramienta "mcp_login" para autenticar.');
  }

  // Manejo de señales de terminación
  const shutdown = async () => {
    console.error('[QR-Maker MCP] Cerrando servidor...');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('[QR-Maker MCP] Error fatal en bootstrap:', error);
  process.exit(1);
});
