import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalyticsView } from './AnalyticsView';
import { api, User } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getLinks: vi.fn(),
    getLinkStats: vi.fn(),
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
    (api.getLinks as any).mockResolvedValue([
      {
        id: 'link-1',
        name: 'Menú Digital QR + NFC Mesa',
        shortCode: 'menu',
        targetUrl: 'https://restaurantecentral.com',
        isActive: true,
      },
    ]);
  });

  it('renders 4 main KPIs, activity chart and audience breakdowns matching reference', async () => {
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
    expect(screen.getByText('TOTAL ESCANEOS')).toBeInTheDocument();
    expect(screen.getByText('2,410')).toBeInTheDocument();
    expect(screen.getByText('VISIT. ÚNICOS')).toBeInTheDocument();
    expect(screen.getByText('1,894')).toBeInTheDocument();
    expect(screen.getByText('Actividad Semanal')).toBeInTheDocument();
    expect(screen.getByText('Sistemas Operativos')).toBeInTheDocument();
    expect(screen.getByText('Mobile Safari')).toBeInTheDocument();
    expect(screen.getByText('Honduras')).toBeInTheDocument();
    expect(screen.getByText('Puntos de Captura')).toBeInTheDocument();
  });
});
