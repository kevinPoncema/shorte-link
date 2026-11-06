import { McpConfig } from '../config/mcp.config';
import { AuthLoginResponse, UserProfile } from './types';

export class ApiClient {
  private apiBaseUrl: string;
  private accessToken: string | null = null;
  private email: string | null = null;
  private password: string | null = null;

  constructor(config: McpConfig) {
    this.apiBaseUrl = config.apiBaseUrl;
    if (config.defaultToken) {
      this.accessToken = config.defaultToken;
    }
    if (config.defaultEmail && config.defaultPassword) {
      this.email = config.defaultEmail;
      this.password = config.defaultPassword;
    }
  }

  public setToken(token: string): void {
    this.accessToken = token;
  }

  public setCredentials(email: string, password: string): void {
    this.email = email;
    this.password = password;
  }

  public getToken(): string | null {
    return this.accessToken;
  }

  public isAuthenticated(): boolean {
    return Boolean(this.accessToken || (this.email && this.password));
  }

  public getSessionInfo(): { hasToken: boolean; hasCredentials: boolean; email: string | null } {
    return {
      hasToken: Boolean(this.accessToken),
      hasCredentials: Boolean(this.email && this.password),
      email: this.email,
    };
  }

  /**
   * Autenticación explícita con email y contraseña contra POST /auth/login.
   */
  public async login(email?: string, password?: string): Promise<AuthLoginResponse> {
    const targetEmail = email || this.email;
    const targetPassword = password || this.password;

    if (!targetEmail || !targetPassword) {
      throw new Error(
        'Credenciales no configuradas. Proporciona email y contraseña o define QR_API_EMAIL y QR_API_PASSWORD.',
      );
    }

    const res = await fetch(`${this.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: targetEmail, password: targetPassword }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `Error de autenticación (${res.status}): ${
          (errBody as any).message || 'Credenciales inválidas'
        }`,
      );
    }

    const data = (await res.json()) as AuthLoginResponse;
    this.accessToken = data.accessToken;
    this.email = targetEmail;
    this.password = targetPassword;

    console.error(`[MCP ApiClient] Sesión autenticada exitosamente para ${targetEmail}`);
    return data;
  }

  /**
   * Refresca el token actual consultando GET /auth/me.
   * La API rota el token automáticamente si el plan cambió o si se solicita un perfil activo.
   */
  public async refreshToken(): Promise<UserProfile> {
    if (!this.accessToken && this.email && this.password) {
      await this.login();
    }

    if (!this.accessToken) {
      throw new Error('No hay sesión activa para refrescar el token. Ejecuta mcp_login primero.');
    }

    const res = await fetch(`${this.apiBaseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!res.ok) {
      // Si recibimos 401 y tenemos credenciales, re-iniciamos sesión
      if (res.status === 401 && this.email && this.password) {
        console.error('[MCP ApiClient] Token expirado en refresh. Reautenticando con credenciales...');
        await this.login();
        return this.refreshToken();
      }

      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `No fue posible refrescar la sesión (${res.status}): ${
          (errBody as any).message || res.statusText
        }`,
      );
    }

    const data = (await res.json()) as UserProfile;
    if (data.accessToken) {
      this.accessToken = data.accessToken;
      console.error('[MCP ApiClient] Token de acceso actualizado exitosamente.');
    }

    return data;
  }

  /**
   * Ejecuta peticiones JSON genéricas hacia la API con inyección de Bearer Token
   * y reintento automático transparente ante 401 si hay credenciales disponibles.
   */
  public async request<T>(
    path: string,
    options: RequestInit = {},
    isRetry = false,
  ): Promise<T> {
    // Si no tenemos token pero sí credenciales, logueamos previamente
    if (!this.accessToken && this.email && this.password) {
      await this.login();
    }

    const url = `${this.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401 && !isRetry && this.email && this.password) {
      console.error(`[MCP ApiClient] 401 Unauthorized en ${path}. Reautenticando automáticamente...`);
      await this.login();
      return this.request<T>(path, options, true);
    }

    if (!res.ok) {
      let errorMessage = `HTTP Error ${res.status} (${res.statusText})`;
      try {
        const errorData = await res.json();
        if (errorData && (errorData as any).message) {
          const detail = Array.isArray((errorData as any).message)
            ? (errorData as any).message.join(', ')
            : (errorData as any).message;
          errorMessage = `${detail} (HTTP ${res.status})`;
        }
      } catch {
        // Ignorar error de parseo si no es JSON
      }
      throw new Error(errorMessage);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return (await res.json()) as T;
  }

  /**
   * Petición para descargar datos binarios (SVG / PNG para renderizado de QR).
   */
  public async requestBuffer(
    path: string,
    options: RequestInit = {},
    isRetry = false,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    if (!this.accessToken && this.email && this.password) {
      await this.login();
    }

    const url = `${this.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401 && !isRetry && this.email && this.password) {
      console.error(`[MCP ApiClient] 401 Unauthorized al obtener binario. Reautenticando...`);
      await this.login();
      return this.requestBuffer(path, options, true);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Error al solicitar binario (${res.status}): ${errText || res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  }
}
