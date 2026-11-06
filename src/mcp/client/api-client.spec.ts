import { ApiClient } from './api-client';

describe('ApiClient', () => {
  const mockConfig = {
    apiBaseUrl: 'http://localhost:3000',
    defaultToken: 'initial-jwt-token',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('debe inicializarse con el token configurado', () => {
    const client = new ApiClient(mockConfig);
    expect(client.getToken()).toBe('initial-jwt-token');
    expect(client.isAuthenticated()).toBe(true);
    expect(client.getSessionInfo().hasToken).toBe(true);
  });

  it('debe permitir actualizar token y credenciales manualmente', () => {
    const client = new ApiClient({ apiBaseUrl: 'http://localhost:3000' });
    expect(client.getToken()).toBeNull();
    expect(client.isAuthenticated()).toBe(false);

    client.setToken('new-token');
    expect(client.getToken()).toBe('new-token');

    client.setCredentials('user@test.com', 'pass123');
    expect(client.getSessionInfo().email).toBe('user@test.com');
    expect(client.getSessionInfo().hasCredentials).toBe(true);
  });

  it('debe realizar peticiones GET agregando el Bearer Token', async () => {
    const client = new ApiClient(mockConfig);
    const mockData = { id: 'link-123', name: 'Promo' };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockData),
    } as any);

    const result = await client.request('/links/link-123', { method: 'GET' });

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/links/link-123', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer initial-jwt-token',
      },
    });
    expect(result).toEqual(mockData);
  });

  it('debe re-autenticar de forma transparente ante 401 si hay credenciales guardadas', async () => {
    const client = new ApiClient({
      apiBaseUrl: 'http://localhost:3000',
      defaultEmail: 'user@test.com',
      defaultPassword: 'securePassword',
      defaultToken: 'expired-token',
    });

    let callCount = 0;
    global.fetch = jest.fn().mockImplementation((url) => {
      callCount++;
      if (url.includes('/auth/login')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ accessToken: 'fresh-jwt-token', user: { email: 'user@test.com' } }),
        });
      }
      if (callCount === 1) {
        // Primera petición falla con 401
        return Promise.resolve({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ message: 'Token expired' }),
        });
      }
      // Segunda petición reintentada tiene éxito
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      });
    });

    const result = await client.request('/links');

    expect(client.getToken()).toBe('fresh-jwt-token');
    expect(result).toEqual({ success: true });
    expect(callCount).toBe(3); // 1. links (401), 2. login (200), 3. links retry (200)
  });

  it('debe solicitar binarios con requestBuffer correctamente', async () => {
    const client = new ApiClient(mockConfig);
    const mockSvg = '<svg></svg>';
    const uint8 = new TextEncoder().encode(mockSvg);
    const arrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/svg+xml' }),
      arrayBuffer: () => Promise.resolve(arrayBuffer),
    } as any);

    const res = await client.requestBuffer('/links/123/qr?format=svg');
    expect(res.contentType).toBe('image/svg+xml');
    expect(res.buffer.toString('utf-8')).toBe(mockSvg);
  });
});
