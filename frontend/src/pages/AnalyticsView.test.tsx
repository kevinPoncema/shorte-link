import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsView } from './AnalyticsView';
import { api, User } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getLinks: vi.fn(),
    getLinkStats: vi.fn(),
    getPhysicalOrders: vi.fn(),
  },
  API_BASE_URL: 'http://localhost:3000',
}));

describe('AnalyticsView Component', () => {
  const mockUser: User = {
    id: 'user-1',
    email: 'test@kinetiqr.com',
    plan: 'STARTER',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getPhysicalOrders as any).mockResolvedValue([]);
    (api.getLinks as any).mockResolvedValue([
      {
        id: 'link-1',
        name: 'Menú Digital QR + NFC Mesa',
        shortCode: 'menu',
        targetUrl: 'https://restaurantecentral.com',
        isActive: true,
      },
    ]);
    (api.getLinkStats as any).mockResolvedValue({
      linkId: 'link-1',
      period: '7d',
      summary: {
        totalClicks: 2410,
        uniqueVisitors: 1894,
        topCountry: 'HN',
        topDevice: 'iOS (Apple)',
      },
      timeline: [
        { date: '2026-11-01', clicks: 200 },
        { date: '2026-11-02', clicks: 420 },
      ],
      breakdowns: {
        os: [{ name: 'Apple iOS', count: 1638, percentage: 68 }],
        browsers: [{ name: 'Mobile Safari', count: 1566, percentage: 65 }],
        countries: [{ code: 'HN', name: 'Honduras', count: 1253, percentage: 52 }],
        referrers: [{ source: 'Placa NFC Mostrador', count: 1156, percentage: 48 }],
      },
    });
  });

  it('renders 4 main KPIs, activity chart and dynamic audience breakdowns matching API data', async () => {
    render(
      <AnalyticsView
        currentUser={mockUser}
        linkId="link-1"
        onBack={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    expect(await screen.findByText('Menú Digital QR + NFC Mesa')).toBeInTheDocument();
    expect(await screen.findByText('2,410')).toBeInTheDocument();
    expect(screen.getByText('TOTAL ESCANEOS')).toBeInTheDocument();
    expect(screen.getByText('VISIT. ÚNICOS')).toBeInTheDocument();
    expect(screen.getByText('1,894')).toBeInTheDocument();
    expect(screen.getByText('Actividad en el Período')).toBeInTheDocument();
    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument();
    expect(screen.getByText('Apple iOS')).toBeInTheDocument();
    expect(screen.getByText('Mobile Safari')).toBeInTheDocument();
    expect(screen.getByText('Honduras')).toBeInTheDocument();
    expect(screen.getAllByText('Placa NFC Mostrador').length).toBeGreaterThan(0);
  });

  it('renders empty state when user has no links created', async () => {
    (api.getLinks as any).mockResolvedValue([]);

    render(
      <AnalyticsView
        currentUser={mockUser}
        linkId={null}
        onBack={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    expect(await screen.findByText(/No tienes enlaces creados todavía/i)).toBeInTheDocument();
    expect(screen.getByText('Ir al Editor QR')).toBeInTheDocument();
  });

  it('filters selector links by name in real-time', async () => {
    (api.getLinks as any).mockResolvedValue([
      {
        id: 'link-1',
        name: 'Menú Digital QR + NFC Mesa',
        shortCode: 'menu',
        targetUrl: 'https://rest.com/menu',
        isActive: true,
      },
      {
        id: 'link-2',
        name: 'Campaña Black Friday 2026',
        shortCode: 'bf2026',
        targetUrl: 'https://tienda.com/bf',
        isActive: true,
      },
      {
        id: 'link-3',
        name: 'Redirección Wi-Fi Hotel',
        shortCode: 'wifi-hotel',
        targetUrl: 'https://hotel.com/wifi',
        isActive: false,
      },
    ]);

    render(
      <AnalyticsView
        currentUser={mockUser}
        linkId="link-1"
        onBack={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    // Verify search input is rendered
    const filterInput = await screen.findByPlaceholderText('Filtrar por nombre...');
    expect(filterInput).toBeInTheDocument();

    const selector = screen.getByLabelText('Seleccionar enlace analizado') as HTMLSelectElement;
    expect(selector.options).toHaveLength(3);

    // Type "Friday" into the name filter
    fireEvent.change(filterInput, { target: { value: 'Friday' } });

    // Selector should now only contain the matching link
    expect(selector.options).toHaveLength(1);
    expect(selector.options[0].text).toBe('Campaña Black Friday 2026');
  });
});
