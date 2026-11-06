import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { AuthClientService } from '../services/auth-client.service';

export function registerAuthTools(server: McpServer, authService: AuthClientService): void {
  // Tool: Iniciar sesión
  server.tool(
    'mcp_login',
    'Inicia sesión en la plataforma QR Maker usando email y contraseña para obtener o renovar el token JWT.',
    {
      email: z.string().email().describe('Correo electrónico del usuario'),
      password: z.string().min(1).describe('Contraseña de la cuenta'),
    },
    async ({ email, password }) => {
      try {
        const result = await authService.login(email, password);
        return {
          content: [
            {
              type: 'text',
              text: `Sesión iniciada exitosamente para ${result.user.email}.\nID de usuario: ${result.user.id}\nPlan actual: ${result.user.plan}\nEl token se ha almacenado en memoria para las siguientes operaciones.`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error al iniciar sesión: ${error.message}`,
            },
          ],
        };
      }
    },
  );

  // Tool: Refrescar token / sesión
  server.tool(
    'mcp_refresh_token',
    'Refresca el token JWT actual y sincroniza el perfil y plan vigente llamando a GET /auth/me.',
    {},
    async () => {
      try {
        const profile = await authService.refreshToken();
        return {
          content: [
            {
              type: 'text',
              text: `Token refrescado exitosamente.\nUsuario: ${profile.email}\nPlan activo: ${profile.plan}\nID: ${profile.id}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error al refrescar sesión: ${error.message}`,
            },
          ],
        };
      }
    },
  );

  // Tool: Consultar perfil actual
  server.tool(
    'mcp_get_profile',
    'Consulta los datos de perfil, plan y estado de autenticación del usuario actual.',
    {},
    async () => {
      try {
        const profile = await authService.getProfile();
        const session = authService.getSessionInfo();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  profile: {
                    id: profile.id,
                    email: profile.email,
                    plan: profile.plan,
                    createdAt: profile.createdAt,
                  },
                  session: {
                    hasToken: session.hasToken,
                    configuredEmail: session.email,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error al consultar perfil: ${error.message}`,
            },
          ],
        };
      }
    },
  );
}
