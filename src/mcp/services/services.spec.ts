import { ApiClient } from '../client/api-client';
import { AuthClientService } from './auth-client.service';
import { LinksClientService } from './links-client.service';
import { OrdersClientService } from './orders-client.service';
import { StatsClientService } from './stats-client.service';

describe('MCP Client Services', () => {
  let mockApiClient: jest.Mocked<ApiClient>;

  beforeEach(() => {
    mockApiClient = {
      request: jest.fn(),
      requestBuffer: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      getSessionInfo: jest.fn(),
    } as any;
  });

  describe('AuthClientService', () => {
    it('debe delegar login, getProfile y refreshToken al ApiClient', async () => {
      const authService = new AuthClientService(mockApiClient);

      mockApiClient.login.mockResolvedValueOnce({
        accessToken: 'token-123',
        user: { id: 'u1', email: 'test@mail.com', plan: 'PRO' },
      });
      await authService.login('test@mail.com', 'pass');
      expect(mockApiClient.login).toHaveBeenCalledWith('test@mail.com', 'pass');

      mockApiClient.request.mockResolvedValueOnce({ id: 'u1', email: 'test@mail.com', plan: 'PRO' });
      const profile = await authService.getProfile();
      expect(mockApiClient.request).toHaveBeenCalledWith('/auth/me', { method: 'GET' });
      expect(profile.plan).toBe('PRO');

      mockApiClient.refreshToken.mockResolvedValueOnce({ id: 'u1', email: 'test@mail.com', plan: 'PRO' });
      await authService.refreshToken();
      expect(mockApiClient.refreshToken).toHaveBeenCalled();
    });
  });

  describe('LinksClientService', () => {
    it('debe crear enlaces delegando a POST /links', async () => {
      const linksService = new LinksClientService(mockApiClient);
      const input = { name: 'Promo', targetUrl: 'https://ejemplo.com' };

      mockApiClient.request.mockResolvedValueOnce({ id: 'l1', ...input });
      const link = await linksService.createLink(input);

      expect(mockApiClient.request).toHaveBeenCalledWith('/links', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      expect(link.id).toBe('l1');
    });

    it('debe listar enlaces construyendo los query parameters adecuadamente', async () => {
      const linksService = new LinksClientService(mockApiClient);

      mockApiClient.request.mockResolvedValueOnce({ items: [], total: 0 });
      await linksService.listLinks({ page: 2, limit: 10, search: 'promo', isActive: true });

      expect(mockApiClient.request).toHaveBeenCalledWith(
        '/links?page=2&limit=10&search=promo&isActive=true',
        { method: 'GET' },
      );
    });

    it('debe procesar getQrCode para SVG y PNG', async () => {
      const linksService = new LinksClientService(mockApiClient);

      mockApiClient.requestBuffer.mockResolvedValueOnce({
        buffer: Buffer.from('<svg></svg>'),
        contentType: 'image/svg+xml',
      });
      const svgRes = await linksService.getQrCode('link-1', 'svg');
      expect(svgRes.format).toBe('svg');
      expect(svgRes.content).toContain('<svg>');

      mockApiClient.requestBuffer.mockResolvedValueOnce({
        buffer: Buffer.from('fake-png-data'),
        contentType: 'image/png',
      });
      const pngRes = await linksService.getQrCode('link-1', 'png');
      expect(pngRes.format).toBe('png');
      expect(pngRes.dataUri).toContain('data:image/png;base64,');
    });
  });

  describe('StatsClientService', () => {
    it('debe consultar estadísticas con el periodo asignado', async () => {
      const statsService = new StatsClientService(mockApiClient);
      mockApiClient.request.mockResolvedValueOnce({ linkId: 'link-1', summary: { totalClicks: 42 } });

      const stats = await statsService.getLinkStats('link-1', '30d');
      expect(mockApiClient.request).toHaveBeenCalledWith('/links/link-1/stats?period=30d', {
        method: 'GET',
      });
      expect(stats.summary.totalClicks).toBe(42);
    });
  });

  describe('OrdersClientService', () => {
    it('debe obtener órdenes y permitir filtrado en memoria', async () => {
      const ordersService = new OrdersClientService(mockApiClient);
      const mockOrders = [
        { id: 'o1', paymentStatus: 'paid', fulfillmentStatus: 'shipped' },
        { id: 'o2', paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled' },
      ];

      mockApiClient.request.mockResolvedValueOnce(mockOrders);
      const allOrders = await ordersService.getOrders();
      expect(allOrders.length).toBe(2);

      mockApiClient.request.mockResolvedValueOnce(mockOrders);
      const filtered = await ordersService.getOrders({ paymentStatus: 'paid' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('o1');

      mockApiClient.request.mockResolvedValueOnce(mockOrders);
      const order1 = await ordersService.getOrderById('o1');
      expect(order1?.id).toBe('o1');
    });

    it('debe consultar la suscripción y la configuración de hardware', async () => {
      const ordersService = new OrdersClientService(mockApiClient);

      mockApiClient.request.mockResolvedValueOnce({ subscription: { id: 'sub-1', status: 'active' } });
      const sub = await ordersService.getSubscription();
      expect(sub.subscription?.status).toBe('active');

      mockApiClient.request.mockResolvedValueOnce({
        physicalOrdersEnabled: true,
        prices: { pvcCard: 15 },
      });
      const config = await ordersService.getBillingConfig();
      expect(config.physicalOrdersEnabled).toBe(true);
      expect(config.prices.pvcCard).toBe(15);
    });
  });
});
