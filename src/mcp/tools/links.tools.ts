import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LinksClientService } from '../services/links-client.service';

const qrConfigSchema = z
  .object({
    foregroundColor: z
      .string()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Debe ser un código hexadecimal válido (ej. #000000)')
      .optional()
      .describe('Color del código QR en formato hexadecimal (ej. #000000)'),
    backgroundColor: z
      .string()
      .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Debe ser un código hexadecimal válido (ej. #ffffff)')
      .optional()
      .describe('Color de fondo del código QR en formato hexadecimal (ej. #ffffff)'),
    margin: z.number().int().min(0).max(10).optional().describe('Margen en módulos (0-10)'),
    errorCorrectionLevel: z
      .enum(['L', 'M', 'Q', 'H'])
      .optional()
      .describe('Nivel de corrección de error (L: 7%, M: 15%, Q: 25%, H: 30%)'),
    format: z.enum(['png', 'svg']).optional().describe('Formato predeterminado de renderizado (png o svg)'),
  })
  .optional();

export function registerLinksTools(server: McpServer, linksService: LinksClientService): void {
  // Tool: Crear enlace y configuración QR
  server.tool(
    'create_link',
    'Crea un nuevo enlace corto dinámico y su configuración QR asociada, precalentando la redirección en caché.',
    {
      name: z.string().min(1).max(120).describe('Nombre descriptivo del enlace'),
      targetUrl: z
        .string()
        .url()
        .refine((url) => /^https?:\/\//i.test(url), 'La URL debe comenzar con http:// o https://')
        .describe('URL de destino final hacia donde redirigirá el enlace'),
      shortCode: z
        .string()
        .min(3)
        .max(30)
        .regex(/^[a-zA-Z0-9_-]+$/, 'El slug solo puede contener letras, números, guiones y guiones bajos')
        .optional()
        .describe('Slug personalizado opcional (si se omite, el sistema generará uno único automáticamente)'),
      qrConfig: qrConfigSchema,
    },
    async (params) => {
      try {
        const link = await linksService.createLink(params);
        return {
          content: [
            {
              type: 'text',
              text: `Enlace creado con éxito:\n\n` +
                `• ID: ${link.id}\n` +
                `• Nombre: ${link.name}\n` +
                `• Slug (Short Code): ${link.shortCode}\n` +
                `• Destino: ${link.targetUrl}\n` +
                `• Estado: ${link.isActive ? 'Activo' : 'Inactivo'}\n` +
                `• Creado: ${link.createdAt}\n\n` +
                `Para renderizar el código QR, invoca la herramienta 'get_qr_code' con el ID '${link.id}'.`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al crear enlace: ${error.message}` }],
        };
      }
    },
  );

  // Tool: Listar enlaces
  server.tool(
    'list_links',
    'Lista los enlaces cortos del usuario autenticado con filtros opcionales de búsqueda y paginación.',
    {
      page: z.number().int().min(1).optional().default(1).describe('Número de página (por defecto 1)'),
      limit: z.number().int().min(1).max(50).optional().default(20).describe('Cantidad de registros por página (máx. 50)'),
      search: z.string().optional().describe('Término de búsqueda por nombre, slug o URL de destino'),
      isActive: z.boolean().optional().describe('Filtrar por estado activo (true) o inactivo (false)'),
    },
    async (params) => {
      try {
        const result = await linksService.listLinks(params);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al listar enlaces: ${error.message}` }],
        };
      }
    },
  );

  // Tool: Obtener detalle de enlace
  server.tool(
    'get_link',
    'Obtiene los detalles completos y la configuración visual de un enlace corto por su ID (UUID).',
    {
      id: z.string().uuid().describe('Identificador UUID v4 del enlace'),
    },
    async ({ id }) => {
      try {
        const link = await linksService.getLinkById(id);
        return {
          content: [{ type: 'text', text: JSON.stringify(link, null, 2) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al obtener enlace '${id}': ${error.message}` }],
        };
      }
    },
  );

  // Tool: Actualizar enlace
  server.tool(
    'update_link',
    'Actualiza el destino, nombre, estado o diseño QR de un enlace existente, invalidando reactivamente la caché Redis.',
    {
      id: z.string().uuid().describe('Identificador UUID v4 del enlace'),
      name: z.string().min(1).max(120).optional().describe('Nuevo nombre descriptivo'),
      targetUrl: z
        .string()
        .url()
        .refine((url) => /^https?:\/\//i.test(url), 'La URL debe comenzar con http:// o https://')
        .optional()
        .describe('Nueva URL de destino para la redirección'),
      isActive: z.boolean().optional().describe('Pausar (false) o reanudar (true) la redirección del enlace'),
      qrConfig: qrConfigSchema,
    },
    async ({ id, ...input }) => {
      try {
        const updated = await linksService.updateLink(id, input);
        return {
          content: [
            {
              type: 'text',
              text: `Enlace actualizado exitosamente:\n\n` +
                `• ID: ${updated.id}\n` +
                `• Nombre: ${updated.name}\n` +
                `• Slug: ${updated.shortCode}\n` +
                `• Destino actual: ${updated.targetUrl}\n` +
                `• Estado: ${updated.isActive ? 'Activo' : 'Inactivo'}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al actualizar enlace '${id}': ${error.message}` }],
        };
      }
    },
  );

  // Tool: Eliminar enlace
  server.tool(
    'delete_link',
    'Elimina un enlace corto de la base de datos y purga de forma inmediata la clave en caché Redis.',
    {
      id: z.string().uuid().describe('Identificador UUID v4 del enlace a eliminar'),
    },
    async ({ id }) => {
      try {
        await linksService.deleteLink(id);
        return {
          content: [
            {
              type: 'text',
              text: `Enlace con ID '${id}' eliminado exitosamente. La caché de redirección ha sido purgada.`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al eliminar enlace '${id}': ${error.message}` }],
        };
      }
    },
  );

  // Tool: Renderizar Código QR
  server.tool(
    'get_qr_code',
    'Genera y renderiza el código QR dinámico de un enlace en formato SVG vectorial (texto) o PNG matricial (base64).',
    {
      id: z.string().uuid().describe('Identificador UUID v4 del enlace'),
      format: z
        .enum(['svg', 'png'])
        .optional()
        .default('svg')
        .describe('Formato de salida deseado. SVG es recomendado para modelos de lenguaje por ser vectorial y legible.'),
    },
    async ({ id, format }) => {
      try {
        const qr = await linksService.getQrCode(id, format);
        if (qr.format === 'svg') {
          return {
            content: [
              {
                type: 'text',
                text: `Código QR generado en formato SVG vectorial para el enlace '${id}':\n\n${qr.content}`,
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: 'text',
                text: `Código QR generado en formato PNG (base64) para el enlace '${id}':\n\nData URI: ${qr.dataUri}`,
              },
            ],
          };
        }
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error al renderizar QR para '${id}': ${error.message}` }],
        };
      }
    },
  );
}
