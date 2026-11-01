import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhysicalOrderModal } from './PhysicalOrderModal';
import { api, LinkItem } from '../services/api';

vi.mock('../services/api', () => ({
  API_BASE_URL: 'http://localhost:3000',
  api: {
    createPhysicalOrderCheckout: vi.fn(),
    createDirectPhysicalOrder: vi.fn(),
  },
}));

describe('PhysicalOrderModal (Physical QR & NFC Product Ordering with Mocks)', () => {
  const mockLink: LinkItem = {
    id: 'link-uuid-123',
    name: 'Menú Digital Restaurante',
    shortCode: 'menu123',
    targetUrl: 'https://mirestaurante.com/carta',
    isActive: true,
    userId: 'user-1',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };

  const mockOnClose = vi.fn();
  const mockOnOrderSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).location;
    window.location = {
      href: '',
      origin: 'http://localhost:5173',
      pathname: '/dashboard',
    } as any;
  });

  it('no renderiza nada si isOpen es false o link es null', () => {
    const { container: c1 } = render(
      <PhysicalOrderModal
        isOpen={false}
        link={mockLink}
        onClose={mockOnClose}
      />,
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <PhysicalOrderModal
        isOpen={true}
        link={null}
        onClose={mockOnClose}
      />,
    );
    expect(c2.firstChild).toBeNull();
  });

  it('renderiza el catálogo de productos físicos con chip NFC y la información del enlace', () => {
    render(
      <PhysicalOrderModal
        isOpen={true}
        link={mockLink}
        onClose={mockOnClose}
        onOrderSuccess={mockOnOrderSuccess}
      />,
    );

    // Título y link
    expect(screen.getByText('Pedir Placa o Tarjeta NFC Física')).toBeInTheDocument();
    expect(screen.getAllByText('Menú Digital Restaurante').length).toBeGreaterThan(0);

    // Productos disponibles
    expect(screen.getAllByText('Placa Acrílica con QR + NFC').length).toBeGreaterThan(0);
    expect(screen.getByText('Tarjeta Plástica PVC Inteligente')).toBeInTheDocument();
    expect(screen.getByText('Sticker Resinado Anti-Metal')).toBeInTheDocument();

    // Precios
    expect(screen.getAllByText('$15.00 USD').length).toBeGreaterThan(0);
    expect(screen.getByText('$10.00 USD')).toBeInTheDocument();
    expect(screen.getByText('$5.00 USD')).toBeInTheDocument();

    // Resumen de total inicial
    expect(screen.getByText('Total a Cobrar:')).toBeInTheDocument();
  });

  it('permite cambiar de producto físico y recalcula el monto total', async () => {
    render(
      <PhysicalOrderModal
        isOpen={true}
        link={mockLink}
        onClose={mockOnClose}
      />,
    );

    // Seleccionamos la tarjeta plástica PVC ($10)
    const cardProduct = screen.getByText('Tarjeta Plástica PVC Inteligente');
    fireEvent.click(cardProduct);

    // Cambiamos cantidad a 5 pulsando el botón de acceso rápido '5'
    const qty5Btn = screen.getByText('5');
    fireEvent.click(qty5Btn);

    // 5 x $10 = $50.00
    await waitFor(() => {
      expect(screen.getByText('$50.00 USD')).toBeInTheDocument();
    });
  });

  it('valida campos obligatorios de envío antes de procesar la orden', async () => {
    render(
      <PhysicalOrderModal
        isOpen={true}
        link={mockLink}
        onClose={mockOnClose}
      />,
    );

    const directOrderBtn = screen.getByTestId('direct-order-btn');
    fireEvent.click(directOrderBtn);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Por favor completa todos los campos obligatorios de la dirección de entrega.',
        ),
      ).toBeInTheDocument();
    });
    expect(api.createDirectPhysicalOrder).not.toHaveBeenCalled();
  });

  it('emite una orden física directa (Modo Dev) y muestra pantalla de confirmación', async () => {
    vi.mocked(api.createDirectPhysicalOrder).mockResolvedValue({
      id: 'order-phys-999',
      userId: 'user-1',
      providerPaymentIntentId: 'direct_123',
      totalAmount: 15.0,
      currency: 'USD',
      paymentStatus: 'paid',
      fulfillmentStatus: 'in_production',
      shippingAddress: {
        fullName: 'Juan Pérez',
        addressLine1: 'Col. Palmira, Calle Principal',
        city: 'Tegucigalpa',
        phone: '+50499998888',
      },
      items: [
        {
          id: 'item-1',
          orderId: 'order-phys-999',
          linkId: mockLink.id,
          itemType: 'acrylic_stand',
          quantity: 1,
          unitPrice: 15.0,
          specifications: null,
        },
      ],
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });

    render(
      <PhysicalOrderModal
        isOpen={true}
        link={mockLink}
        onClose={mockOnClose}
        onOrderSuccess={mockOnOrderSuccess}
      />,
    );

    // Rellenamos campos de envío
    fireEvent.change(screen.getByPlaceholderText('Ej. Juan Pérez'), {
      target: { value: 'Juan Pérez' },
    });
    fireEvent.change(screen.getByPlaceholderText('+504 9999-9999'), {
      target: { value: '+50499998888' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Ej. Barrio Guamilito, 5ta Calle, 8va Avenida'),
      {
        target: { value: 'Col. Palmira, Calle Principal' },
      },
    );
    fireEvent.change(screen.getByPlaceholderText('Ej. San Pedro Sula'), {
      target: { value: 'Tegucigalpa' },
    });

    const directOrderBtn = screen.getByTestId('direct-order-btn');
    fireEvent.click(directOrderBtn);

    await waitFor(() => {
      expect(api.createDirectPhysicalOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              linkId: mockLink.id,
              itemType: 'acrylic_stand',
              quantity: 1,
            }),
          ]),
          shippingAddress: expect.objectContaining({
            fullName: 'Juan Pérez',
            city: 'Tegucigalpa',
            phone: '+50499998888',
          }),
        }),
      );
    });

    // Pantalla de confirmación
    expect(
      screen.getByText('¡Orden Física Emitida Exitosamente!'),
    ).toBeInTheDocument();
    expect(screen.getByText('order-phys-999')).toBeInTheDocument();
    expect(screen.getByText('in_production')).toBeInTheDocument();
    expect(mockOnOrderSuccess).toHaveBeenCalled();
  });

  it('procesa el pago vía Stripe Checkout y redirige al usuario', async () => {
    vi.mocked(api.createPhysicalOrderCheckout).mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/pay/cs_order_session_456',
    });

    render(
      <PhysicalOrderModal
        isOpen={true}
        link={mockLink}
        onClose={mockOnClose}
      />,
    );

    // Rellenamos formulario
    fireEvent.change(screen.getByPlaceholderText('Ej. Juan Pérez'), {
      target: { value: 'Carlos Gómez' },
    });
    fireEvent.change(screen.getByPlaceholderText('+504 9999-9999'), {
      target: { value: '+50488887777' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Ej. Barrio Guamilito, 5ta Calle, 8va Avenida'),
      {
        target: { value: 'Boulevard Morazán' },
      },
    );
    fireEvent.change(screen.getByPlaceholderText('Ej. San Pedro Sula'), {
      target: { value: 'Tegucigalpa' },
    });

    const stripePayBtn = screen.getByTestId('stripe-order-btn');
    fireEvent.click(stripePayBtn);

    await waitFor(() => {
      expect(api.createPhysicalOrderCheckout).toHaveBeenCalled();
      expect(window.location.href).toBe(
        'https://checkout.stripe.com/pay/cs_order_session_456',
      );
    });
  });
});
