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
  customDomain?: string | null;
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

export interface Subscription {
  id: string;
  userId: string;
  providerName: string;
  providerCustomerId: string;
  providerSubscriptionId?: string | null;
  providerPriceId?: string | null;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionResponse {
  subscription: Subscription | null;
}

export interface CheckoutResponse {
  checkoutUrl: string;
}

export interface PortalResponse {
  url: string;
}

export interface PlanChangeResponse {
  success: boolean;
  message: string;
  plan: string;
  accessToken?: string;
}

export interface BillingConfig {
  physicalOrdersEnabled: boolean;
  proPriceIdConfigured: boolean;
  stripeMockMode: boolean;
  hardwarePrices: Record<string, number>;
}

export interface ShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone: string;
  notes?: string;
}

export interface PhysicalOrderItem {
  id?: string;
  linkId?: string;
  itemType: string;
  quantity: number;
  unitPrice?: number;
  specifications?: Record<string, any>;
}

export interface CreatePhysicalOrderPayload {
  items: PhysicalOrderItem[];
  shippingAddress: ShippingAddress;
  successUrl: string;
  cancelUrl: string;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  linkId: string | null;
  itemType: string;
  quantity: number;
  unitPrice: number;
  specifications: Record<string, any> | null;
}

export interface OrderRecord {
  id: string;
  userId: string;
  providerPaymentIntentId: string | null;
  totalAmount: number;
  currency: string;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  fulfillmentStatus: 'unfulfilled' | 'in_production' | 'shipped' | 'delivered';
  shippingAddress: ShippingAddress | null;
  items: OrderItemRecord[];
  createdAt: string;
  updatedAt: string;
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
    shortCode?: string;
    customDomain?: string;
    qrConfig?: QrConfig;
  }): Promise<LinkItem> {
    return this.request<LinkItem>('/links', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  getQrCodeUrl(id: string, format: 'png' | 'svg' = 'svg'): string {
    return `${API_BASE_URL}/links/${id}/qr?format=${format}`;
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

  // --- User Profile ---
  async getMe(): Promise<User> {
    const data = await this.request<User & { accessToken?: string }>('/auth/me');
    if (data) {
      if (data.accessToken) {
        localStorage.setItem('token', data.accessToken);
      }
      const { accessToken: _token, ...user } = data;
      localStorage.setItem('user', JSON.stringify(user));
      return user as User;
    }
    return data;
  }

  // --- Billing endpoints ---
  async getBillingConfig(): Promise<BillingConfig> {
    return this.request<BillingConfig>('/billing/config');
  }

  async togglePhysicalOrders(
    enabled: boolean,
  ): Promise<{ physicalOrdersEnabled: boolean }> {
    return this.request<{ physicalOrdersEnabled: boolean }>(
      '/billing/config/physical-orders',
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      },
    );
  }

  async getSubscription(): Promise<Subscription | null> {
    const data = await this.request<SubscriptionResponse>('/billing/subscription');
    return data.subscription;
  }

  async createSubscriptionCheckout(payload: {
    priceId?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutResponse> {
    return this.request<CheckoutResponse>('/billing/checkout/subscription', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCustomerPortal(returnUrl?: string): Promise<PortalResponse> {
    const query = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    return this.request<PortalResponse>(`/billing/portal${query}`);
  }

  async cancelSubscription(): Promise<PlanChangeResponse> {
    const res = await this.request<PlanChangeResponse>('/billing/cancel', {
      method: 'POST',
    });
    if (res.accessToken) {
      localStorage.setItem('token', res.accessToken);
    }
    const current = this.getCurrentUser();
    if (current) {
      current.plan = res.plan || 'STARTER';
      localStorage.setItem('user', JSON.stringify(current));
    }
    return res;
  }

  async simulateUpgradeToPro(): Promise<PlanChangeResponse> {
    const res = await this.request<PlanChangeResponse>('/billing/simulate-upgrade', {
      method: 'POST',
    });
    if (res.accessToken) {
      localStorage.setItem('token', res.accessToken);
    }
    const current = this.getCurrentUser();
    if (current) {
      current.plan = res.plan || 'PRO';
      localStorage.setItem('user', JSON.stringify(current));
    }
    return res;
  }

  async completeSandboxCheckout(payload: {
    mode: 'subscription' | 'payment';
    orderId?: string;
    sessionId?: string;
  }): Promise<{
    success: boolean;
    message: string;
    plan?: string;
    orderId?: string;
    accessToken?: string;
  }> {
    const res = await this.request<{
      success: boolean;
      message: string;
      plan?: string;
      orderId?: string;
      accessToken?: string;
    }>('/billing/checkout/sandbox/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.accessToken) {
      localStorage.setItem('token', res.accessToken);
    }
    if (res.plan) {
      const current = this.getCurrentUser();
      if (current) {
        current.plan = res.plan;
        localStorage.setItem('user', JSON.stringify(current));
      }
    }
    return res;
  }

  // --- Physical Orders endpoints ---
  async createPhysicalOrderCheckout(
    payload: CreatePhysicalOrderPayload,
  ): Promise<CheckoutResponse> {
    return this.request<CheckoutResponse>('/billing/checkout/physical', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async createDirectPhysicalOrder(
    payload: CreatePhysicalOrderPayload,
  ): Promise<OrderRecord> {
    return this.request<OrderRecord>('/billing/orders/direct', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getPhysicalOrders(): Promise<OrderRecord[]> {
    return this.request<OrderRecord[]>('/billing/orders');
  }
}

export const api = new ApiService();
export { API_BASE_URL };
