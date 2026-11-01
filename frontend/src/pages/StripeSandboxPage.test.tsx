import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StripeSandboxPage } from './StripeSandboxPage';
import { api, User } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    completeSandboxCheckout: vi.fn(),
    cancelSubscription: vi.fn(),
  },
}));

describe('StripeSandboxPage (Interactive Stripe Checkout UI for Subscription & Physical Orders)', () => {
  const mockUser: User = {
    id: 'user-1',
    email: 'cliente@empresa.com',
    plan: 'STARTER',
    createdAt: '2026-11-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).location;
  });

  it('renderiza la pasarela de pago de suscripción PRO ($19.00) y confirma el pago', async () => {
    window.location = {
      href: '',
      origin: 'http://localhost:5173',
      search:
        '?stripe_sandbox=checkout&mode=subscription&sessionId=cs_sandbox_1&amount=19.00&title=Plan+PRO&successUrl=http%3A%2F%2Flocalhost%3A5173%2F%3Fpayment%3Dsuccess&cancelUrl=http%3A%2F%2Flocalhost%3A5173%2F%3Fpayment%3Dcancelled',
    } as any;

    vi.mocked(api.completeSandboxCheckout).mockResolvedValue({
      success: true,
      message: 'Plan cambiado exitosamente a PRO.',
      plan: 'PRO',
    });

    render(<StripeSandboxPage currentUser={mockUser} />);

    expect(screen.getByTestId('stripe-sandbox-checkout')).toBeInTheDocument();
    expect(screen.getByText('Suscribirse a Plan PRO')).toBeInTheDocument();
    expect(screen.getByText('Suscribirse — $19.00 USD')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stripe-sandbox-submit'));

    await waitFor(() => {
      expect(api.completeSandboxCheckout).toHaveBeenCalledWith({
        mode: 'subscription',
        orderId: undefined,
        sessionId: 'cs_sandbox_1',
      });
    });

    expect(screen.getByText('¡Pago aprobado con éxito!')).toBeInTheDocument();
  });

  it('renderiza la pasarela de pago para pedido físico NFC y confirma la orden', async () => {
    window.location = {
      href: '',
      origin: 'http://localhost:5173',
      search:
        '?stripe_sandbox=checkout&mode=payment&orderId=ord-99&sessionId=cs_ord_99&amount=30.00&qty=2&title=Placa+Acrilica+NFC&successUrl=http%3A%2F%2Flocalhost%3A5173%2F%3Forder%3Dsuccess&cancelUrl=http%3A%2F%2Flocalhost%3A5173%2F%3Forder%3Dcancelled',
    } as any;

    vi.mocked(api.completeSandboxCheckout).mockResolvedValue({
      success: true,
      message: 'Pago confirmado.',
      orderId: 'ord-99',
    });

    render(<StripeSandboxPage currentUser={mockUser} />);

    expect(
      screen.getByText('Pago de pedido físico QR + NFC'),
    ).toBeInTheDocument();
    expect(screen.getByText('Pagar $30.00 USD')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('stripe-sandbox-submit'));

    await waitFor(() => {
      expect(api.completeSandboxCheckout).toHaveBeenCalledWith({
        mode: 'payment',
        orderId: 'ord-99',
        sessionId: 'cs_ord_99',
      });
    });
  });

  it('simula rechazo bancario al seleccionar la tarjeta de prueba 0002 sin cobrar', async () => {
    window.location = {
      href: '',
      origin: 'http://localhost:5173',
      search: '?stripe_sandbox=checkout&mode=subscription&amount=19.00',
    } as any;

    render(<StripeSandboxPage currentUser={mockUser} />);

    fireEvent.click(screen.getByText('Tarjeta 0002 (Rechazo)'));
    fireEvent.click(screen.getByTestId('stripe-sandbox-submit'));

    await waitFor(
      () => {
        expect(
          screen.getByText(/Tu tarjeta fue rechazada por el banco emisor/),
        ).toBeInTheDocument();
      },
      { timeout: 2000 },
    );

    expect(api.completeSandboxCheckout).not.toHaveBeenCalled();
  });
});
