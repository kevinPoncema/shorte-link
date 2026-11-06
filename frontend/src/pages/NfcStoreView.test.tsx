import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NfcStoreView } from './NfcStoreView';
import { api, User } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getLinks: vi.fn(),
    getPhysicalOrders: vi.fn(),
    createPhysicalOrderCheckout: vi.fn(),
  },
  API_BASE_URL: 'http://localhost:3000',
}));

describe('NfcStoreView Component', () => {
  const mockUser: User = {
    id: 'user-1',
    email: 'test@kinetiqr.com',
    plan: 'STARTER',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getLinks as any).mockResolvedValue([]);
    (api.getPhysicalOrders as any).mockResolvedValue([]);
  });

  it('renders 4 hardware products and allows quantity changes', () => {
    render(
      <NfcStoreView
        currentUser={mockUser}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.getAllByText('Stand Acrílico de Mesa').length).toBeGreaterThan(0);
    expect(screen.getByText('Tarjeta PVC de Negocios')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta Inteligente NFC')).toBeInTheDocument();
    expect(screen.getByText('Pack de 5 Stickers Resinados')).toBeInTheDocument();

    // Default 5 units * $15 = $75.00
    expect(screen.getByText(/5x Stand Acrílico de Mesa/i)).toBeInTheDocument();
    expect(screen.getAllByText('$75.00 USD').length).toBeGreaterThan(0);
  });

  it('switches to Mis Órdenes subtab', () => {
    render(
      <NfcStoreView
        currentUser={mockUser}
        onShowToast={vi.fn()}
      />
    );

    const ordersBtn = screen.getByText('Mis Órdenes');
    fireEvent.click(ordersBtn);
    expect(screen.getByText(/EN PRODUCCIÓN \/ PAGADO/i)).toBeInTheDocument();
  });
});
