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

  it('paginates links with exactly 10 per page and allows next/previous navigation', async () => {
    // Generate 15 distinct links
    const fifteenLinks: LinkItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `link-${i + 1}`,
      name: `Campaña Especial #${i + 1}`,
      shortCode: `code${i + 1}`,
      targetUrl: `https://example.com/item-${i + 1}`,
      isActive: true,
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    (api.getLinks as any).mockResolvedValue(fifteenLinks);

    render(
      <LinksDashboardView
        currentUser={{ ...mockUser, plan: 'PRO' }}
        onNavigateToEditor={vi.fn()}
        onNavigateToAnalytics={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
        onPreviewQr={vi.fn()}
        onOrderPhysical={vi.fn()}
      />
    );

    // Initial load should display Page 1 with exactly items 1 through 10
    expect(await screen.findByText('Campaña Especial #1')).toBeInTheDocument();
    expect(screen.getByText('Campaña Especial #10')).toBeInTheDocument();
    expect(screen.queryByText('Campaña Especial #11')).not.toBeInTheDocument();

    expect(screen.getByText(/1 - 10/i)).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();

    // Click "Siguiente" to navigate to page 2
    const nextBtn = screen.getByText('Siguiente');
    fireEvent.click(nextBtn);

    // Page 2 should display items 11 through 15
    expect(screen.getByText('Campaña Especial #11')).toBeInTheDocument();
    expect(screen.getByText('Campaña Especial #15')).toBeInTheDocument();
    expect(screen.queryByText('Campaña Especial #1')).not.toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByText(/11 - 15/i)).toBeInTheDocument();

    // Click "Anterior" to return to page 1
    const prevBtn = screen.getByText('Anterior');
    fireEvent.click(prevBtn);

    expect(screen.getByText('Campaña Especial #1')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
  });

  it('filters links by name case-insensitively and resets page to 1', async () => {
    const mixedLinks: LinkItem[] = [
      {
        id: 'link-1',
        name: 'Black Friday Electrónica',
        shortCode: 'bf-elec',
        targetUrl: 'https://tienda.com/bf',
        isActive: true,
        userId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'link-2',
        name: 'Menú Restaurant Bar',
        shortCode: 'menu-bar',
        targetUrl: 'https://rest.com/menu',
        isActive: true,
        userId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'link-3',
        name: 'Cyber Monday Black Deals',
        shortCode: 'cm-deals',
        targetUrl: 'https://tienda.com/deals',
        isActive: false,
        userId: 'user-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    (api.getLinks as any).mockResolvedValue(mixedLinks);

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

    expect(await screen.findByText('Black Friday Electrónica')).toBeInTheDocument();
    expect(screen.getByText('Menú Restaurant Bar')).toBeInTheDocument();

    // Type in search query "black"
    const searchInput = screen.getByPlaceholderText(/Filtrar por nombre, slug o destino.../i);
    fireEvent.change(searchInput, { target: { value: 'black' } });

    expect(screen.getByText('Black Friday Electrónica')).toBeInTheDocument();
    expect(screen.getByText('Cyber Monday Black Deals')).toBeInTheDocument();
    expect(screen.queryByText('Menú Restaurant Bar')).not.toBeInTheDocument();
  });

  it('enforces mandatory name on inline renaming', async () => {
    const toastMock = vi.fn();
    (api.updateLink as any).mockResolvedValue({
      ...mockLinks[0],
      name: 'Menú Renovado 2026',
    });

    render(
      <LinksDashboardView
        currentUser={mockUser}
        onNavigateToEditor={vi.fn()}
        onNavigateToAnalytics={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={toastMock}
        onPreviewQr={vi.fn()}
        onOrderPhysical={vi.fn()}
      />
    );

    expect(await screen.findByText('Menú Digital QR + NFC Mesa')).toBeInTheDocument();

    // Click edit pencil button next to name
    const editBtns = screen.getAllByTitle('Editar nombre de referencia (Obligatorio)');
    fireEvent.click(editBtns[0]);

    const nameInput = screen.getByPlaceholderText('Nombre obligatorio *');
    expect(nameInput).toBeInTheDocument();

    // Attempt to save with empty name
    fireEvent.change(nameInput, { target: { value: '   ' } });
    const okBtn = screen.getByText('OK');
    fireEvent.click(okBtn);

    expect(toastMock).toHaveBeenCalledWith('El Nombre de Referencia es obligatorio', 'error');
    expect(api.updateLink).not.toHaveBeenCalled();

    // Save with valid name
    fireEvent.change(nameInput, { target: { value: 'Menú Renovado 2026' } });
    fireEvent.click(okBtn);

    await waitFor(() => {
      expect(api.updateLink).toHaveBeenCalledWith('link-1', { name: 'Menú Renovado 2026' });
      expect(toastMock).toHaveBeenCalledWith('Nombre de referencia actualizado', 'success');
    });
  });
});
