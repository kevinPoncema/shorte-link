export interface User {
  id: string;
  email: string;
  plan: string;
  createdAt: string;
}

export interface QrConfig {
  foregroundColor?: string;
  backgroundColor?: string;
  format?: 'png' | 'svg';
  margin?: number;
  width?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface LinkItem {
  id: string;
  name?: string | null;
  shortCode: string;
  targetUrl: string;
  isActive: boolean;
  qrConfig?: QrConfig;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  access_token?: string;
  user: User;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export interface StatsSummary {
  totalClicks: number;
  uniqueVisitors: number;
  topCountry: string | null;
  topDevice: string | null;
}

export interface TimelinePoint {
  date: string;
  clicks: number;
}

export interface NamedBreakdownItem {
  name: string;
  count: number;
  percentage: number;
}

export interface CountryBreakdownItem {
  code: string;
  name: string;
  count: number;
  percentage: number;
}

export interface ReferrerBreakdownItem {
  source: string;
  count: number;
  percentage: number;
}

export interface StatsBreakdowns {
  os: NamedBreakdownItem[];
  browsers: NamedBreakdownItem[];
  countries: CountryBreakdownItem[];
  referrers: ReferrerBreakdownItem[];
}

export interface LinkStatsResponse {
  linkId: string;
  period: string;
  summary: StatsSummary;
  timeline: TimelinePoint[];
  breakdowns: StatsBreakdowns;
}

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

class ApiService {
  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  setSession(token: string, user?: User): void {
    localStorage.setItem('token', token);
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  }

  clearSession(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  getCurrentUser(): User | null {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = `${API_BASE_URL}${endpoint}`;
    let response: Response;

    try {
      response = await fetch(url, {
        ...options,
        headers,
      });
    } catch (networkError: unknown) {
      const msg = (networkError as Error)?.message || 'NetworkError';
      console.error(`Error de red al conectar con ${url}:`, networkError);
      const error: ApiError = {
        statusCode: 0,
        message: `No se pudo conectar con el servidor (${url}). Verifica que el backend esté en ejecución y los métodos CORS estén habilitados. Detalle: ${msg}`,
        error: msg,
      };
      throw error;
    }

    if (response.status === 204) {
      return {} as T;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 401) {
        this.clearSession();
      }

      const rawMsg = data?.message || data?.error || 'Error en la petición';
      const message = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg;
      const error: ApiError = {
        statusCode: response.status,
        message,
        error: data?.error,
      };
      throw error;
    }

    return data as T;
  }

  // --- Auth endpoints ---
  async register(email: string, password: string): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = data.accessToken || data.access_token || '';
    this.setSession(token, data.user);
    return data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const token = data.accessToken || data.access_token || '';
    this.setSession(token, data.user);
    return data;
  }

  // --- Links endpoints ---
  async getLinks(): Promise<LinkItem[]> {
    return this.request<LinkItem[]>('/links');
  }

  async createLink(payload: {
    targetUrl: string;
    name?: string;
    qrConfig?: QrConfig;
  }): Promise<LinkItem> {
    return this.request<LinkItem>('/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateLink(
    id: string,
    payload: {
      name?: string;
      targetUrl?: string;
      isActive?: boolean;
      qrConfig?: QrConfig;
    }
  ): Promise<LinkItem> {
    return this.request<LinkItem>(`/links/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async deleteLink(id: string): Promise<void> {
    await this.request<void>(`/links/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Statistics endpoints ---
  async getLinkStats(linkId: string, period?: string): Promise<LinkStatsResponse> {
    const query = period ? `?period=${encodeURIComponent(period)}` : '';
    return this.request<LinkStatsResponse>(`/links/${linkId}/stats${query}`);
  }
}

export const api = new ApiService();
export { API_BASE_URL };
