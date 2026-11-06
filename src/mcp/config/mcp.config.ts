/**
 * Configuración para el servidor MCP de Dynamic QR & Link Shortener.
 */
export interface McpConfig {
  apiBaseUrl: string;
  defaultEmail?: string;
  defaultPassword?: string;
  defaultToken?: string;
}

export function loadMcpConfig(): McpConfig {
  const apiBaseUrl = (
    process.env.QR_API_URL ||
    process.env.API_BASE_URL ||
    process.env.APP_URL ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');

  return {
    apiBaseUrl,
    defaultEmail: process.env.QR_API_EMAIL || process.env.MCP_AUTH_EMAIL,
    defaultPassword: process.env.QR_API_PASSWORD || process.env.MCP_AUTH_PASSWORD,
    defaultToken: process.env.QR_API_TOKEN || process.env.MCP_AUTH_TOKEN,
  };
}
