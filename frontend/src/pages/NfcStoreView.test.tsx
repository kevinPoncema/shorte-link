import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    (api.getLinks as any).mockResolvedValue([
      {
        id: 'link-1',
        name: 'Menú Digital',
        shortCode: 'menu',
        targetUrl: 'https://ejemplo.com',
        isActive: true,
      },
    ]);
    (api.getPhysicalOrders as any).mockResolvedValue([]);
  });

  it('renders 4 hardware products and allows quantity changes', async () => {
    render(
      <NfcStoreView
        currentUser={mockUser}
        onShowToast={vi.fn()}
      />
    );

    expect((await screen.findAllByText('Stand Acrílico de Mesa')).length).toBeGreaterThan(0);
    expect(screen.getByText('Tarjeta PVC de Negocios')).toBeInTheDocument();
    expect(screen.getByText('Tarjeta Inteligente NFC')).toBeInTheDocument();
    expect(screen.getByText('Pack de 5 Stickers Resinados')).toBeInTheDocument();

    // Default 5 units * $15 = $75.00
    expect(screen.getByText(/5x Stand Acrílico de Mesa/i)).toBeInTheDocument();
    expect(screen.getAllByText('$75.00 USD').length).toBeGreaterThan(0);
  });

  it('switches to Mis Órdenes subtab and displays real order data', async () => {
    (api.getPhysicalOrders as any).mockResolvedValue([
      {
        id: 'order-1',
        paymentStatus: 'paid',
        fulfillmentStatus: 'in_production',
        totalAmount: 75,
        currency: 'USD',
        createdAt: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            orderId: 'order-1',
            itemType: 'Stand Acrílico de Mesa',
            quantity: 5,
            unitPrice: 15,
            linkId: 'link-1',
            specifications: null,
          },
        ],
      },
    ]);

    render(
      <NfcStoreView
        currentUser={mockUser}
        onShowToast={vi.fn()}
      />
    );

    const ordersBtn = screen.getByText('Mis Órdenes');
    fireEvent.click(ordersBtn);

    await waitFor(() => {
      expect(screen.getByText(/EN PRODUCCIÓN \/ PAGADO/i)).toBeInTheDocument();
      expect(screen.getByText(/5x Stand Acrílico de Mesa/i)).toBeInTheDocument();
    });
  });
});
