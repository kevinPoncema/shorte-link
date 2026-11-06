import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LinksDashboardView } from './LinksDashboardView';
import { api, LinkItem, User } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getLinks: vi.fn(),
    updateLink: vi.fn(),
    deleteLink: vi.fn(),
  },
  API_BASE_URL: 'http://localhost:3000',
}));

describe('LinksDashboardView Component', () => {
  const mockUser: User = {
    id: 'user-1',
    email: 'test@kinetiqr.com',
    plan: 'STARTER',
    createdAt: new Date().toISOString(),
  };

  const mockLinks: LinkItem[] = [
    {
      id: 'link-1',
      name: 'Menú Digital QR + NFC Mesa',
      shortCode: 'menu',
      targetUrl: 'https://restaurantecentral.com/menu-verano',
      isActive: true,
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'link-2',
      name: 'Check-in Wi-Fi & Reseñas G...',
      shortCode: 'review',
      targetUrl: 'https://g.page/r/restaurantecentral/review',
      isActive: true,
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getLinks as any).mockResolvedValue(mockLinks);
  });

  it('renders quota banner and mini-KPI cards matching design', async () => {
    render(
      <LinksDashboardView
        currentUser={mockUser}
        onNavigateToEditor={vi.fn()}
        onNavigateToAnalytics={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
        onPreviewQr={vi.fn()}
        onOrderPhysical={vi.fn()}
      />
    );

    // Banner
    expect(await screen.findByText(/2 de 3 enlaces activos/i)).toBeInTheDocument();
    expect(screen.getByText('Desbloquear 50')).toBeInTheDocument();

    // Mini-KPIs (real dynamic values based on 2 of 3 links)
    expect(screen.getByText('ENLACES ACT.')).toBeInTheDocument();
    expect(screen.getByText('CUOTA USO')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
    expect(screen.getByText('DISPONIBLE')).toBeInTheDocument();
  });

  it('renders links and toggles active state', async () => {
    (api.updateLink as any).mockResolvedValue({
      ...mockLinks[0],
      isActive: false,
    });

    render(
      <LinksDashboardView
        currentUser={mockUser}
        onNavigateToEditor={vi.fn()}
        onNavigateToAnalytics={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
        onPreviewQr={vi.fn()}
        onOrderPhysical={vi.fn()}
      />
    );

    expect(await screen.findByText('Menú Digital QR + NFC Mesa')).toBeInTheDocument();
    expect(screen.getByText('kineti.qr/r/menu')).toBeInTheDocument();

    // Toggle button
    const toggles = screen.getAllByRole('button').filter(btn => btn.className.includes('rounded-full'));
    if (toggles.length > 0) {
      fireEvent.click(toggles[0]);
      await waitFor(() => {
        expect(api.updateLink).toHaveBeenCalledWith('link-1', { isActive: false });
      });
    }
  });

  it('renders Starter Paywall card with Subir a PRO button', async () => {
    const handleUpgrade = vi.fn();
    render(
      <LinksDashboardView
        currentUser={mockUser}
        onNavigateToEditor={vi.fn()}
        onNavigateToAnalytics={vi.fn()}
        onOpenUpgradeModal={handleUpgrade}
        onShowToast={vi.fn()}
        onPreviewQr={vi.fn()}
        onOrderPhysical={vi.fn()}
      />
    );

    expect(await screen.findByText('Límite Starter alcanzado')).toBeInTheDocument();
    const upgradeBtn = screen.getByText('Subir a PRO ($19/mes)');
    fireEvent.click(upgradeBtn);
    expect(handleUpgrade).toHaveBeenCalled();
  });

  it('blocks create link button and opens QuotaWarningModal when quota limit is reached', async () => {
    const handleUpgrade = vi.fn();
    const threeLinks: LinkItem[] = [
      ...mockLinks,
      {
        id: 'link-3',
        name: 'Gatos 3',
        shortCode: 'gatos3',
        targetUrl: 'https://purina.com.hn',
        isActive: true,
        userId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    (api.getLinks as any).mockResolvedValue(threeLinks);

    render(
      <LinksDashboardView
        currentUser={mockUser}
        onNavigateToEditor={vi.fn()}
        onNavigateToAnalytics={vi.fn()}
        onOpenUpgradeModal={handleUpgrade}
        onShowToast={vi.fn()}
        onPreviewQr={vi.fn()}
        onOrderPhysical={vi.fn()}
      />
    );

    const blockedBtn = await screen.findByText('+ Crear enlace nuevo (Cuota Agotada)');
    expect(blockedBtn).toBeInTheDocument();

    fireEvent.click(blockedBtn);

    expect(await screen.findByText('Has alcanzado la cuota máxima')).toBeInTheDocument();
    expect(screen.getByText('Desbloquear 50 con Plan PRO')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Desbloquear 50 con Plan PRO'));
    expect(handleUpgrade).toHaveBeenCalled();
  });
});
