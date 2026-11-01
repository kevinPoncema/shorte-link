import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlanManagementModal } from './PlanManagementModal';
import { api, User } from '../services/api';

// Mock del servicio api
vi.mock('../services/api', () => ({
  api: {
    getSubscription: vi.fn(),
    createSubscriptionCheckout: vi.fn(),
    getCustomerPortal: vi.fn(),
    cancelSubscription: vi.fn(),
    simulateUpgradeToPro: vi.fn(),
    getMe: vi.fn(),
  },
}));

describe('PlanManagementModal (Frontend Plan Changing & Cancellation with Mocks)', () => {
  const starterUser: User = {
    id: 'user-starter-1',
    email: 'starter@empresa.com',
    plan: 'STARTER',
    createdAt: '2026-10-31T00:00:00.000Z',
  };

  const proUser: User = {
    id: 'user-pro-2',
    email: 'pro@empresa.com',
    plan: 'PRO',
    createdAt: '2026-10-31T00:00:00.000Z',
  };

  const mockOnClose = vi.fn();
  const mockOnPlanUpdated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock de window.confirm
    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    // Mock de window.location
    delete (window as any).location;
    window.location = {
      href: '',
      origin: 'http://localhost:5173',
      pathname: '/dashboard',
    } as any;
  });

  describe('Escenario 1: Usuario en Plan STARTER (Original)', () => {
    beforeEach(() => {
      vi.mocked(api.getSubscription).mockResolvedValue(null);
    });

    it('renderiza la interfaz destacando el Plan Starter como activo y ofreciendo la mejora a PRO', async () => {
      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={starterUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      // Verificamos títulos de planes tras resolver suscripción
      await waitFor(() => {
        expect(screen.getByText('Plan Starter')).toBeInTheDocument();
        expect(screen.getByText('Plan PRO')).toBeInTheDocument();
      });

      // Verificamos que el botón del Plan Starter esté deshabilitado con "Tu Plan Activo"
      expect(screen.getByText('Tu Plan Activo')).toBeInTheDocument();

      // Verificamos botones de acción hacia PRO
      expect(screen.getByTestId('upgrade-stripe-btn')).toBeInTheDocument();
      expect(screen.getByTestId('simulate-upgrade-btn')).toBeInTheDocument();

      // No debe existir el botón de cancelar
      expect(screen.queryByTestId('cancel-subscription-btn')).not.toBeInTheDocument();
    });

    it('inicia sesión en Stripe Checkout al hacer clic en "Mejorar a PRO con Stripe Checkout"', async () => {
      vi.mocked(api.createSubscriptionCheckout).mockResolvedValue({
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_session_123',
      });

      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={starterUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      const upgradeBtn = screen.getByTestId('upgrade-stripe-btn');
      fireEvent.click(upgradeBtn);

      await waitFor(() => {
        expect(api.createSubscriptionCheckout).toHaveBeenCalledWith({
          successUrl: 'http://localhost:5173/dashboard?payment=success',
          cancelUrl: 'http://localhost:5173/dashboard?payment=cancelled',
        });
        expect(window.location.href).toBe(
          'https://checkout.stripe.com/pay/cs_test_session_123',
        );
      });
    });

    it('permite cambiar a PRO directamente en modo simulación/desarrollo y actualiza el usuario', async () => {
      vi.mocked(api.simulateUpgradeToPro).mockResolvedValue({
        success: true,
        message: 'Plan cambiado exitosamente a PRO.',
        plan: 'PRO',
      });
      vi.mocked(api.getMe).mockResolvedValue({
        ...starterUser,
        plan: 'PRO',
      });

      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={starterUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      const simUpgradeBtn = screen.getByTestId('simulate-upgrade-btn');
      fireEvent.click(simUpgradeBtn);

      await waitFor(() => {
        expect(api.simulateUpgradeToPro).toHaveBeenCalled();
        expect(api.getMe).toHaveBeenCalled();
        expect(mockOnPlanUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ plan: 'PRO' }),
        );
      });

      expect(
        screen.getByText('Plan cambiado exitosamente a PRO.'),
      ).toBeInTheDocument();
    });
  });

  describe('Escenario 2: Usuario en Plan PRO (Cancelar y volver al plan original)', () => {
    beforeEach(() => {
      vi.mocked(api.getSubscription).mockResolvedValue({
        id: 'sub_active_123',
        userId: proUser.id,
        providerName: 'STRIPE',
        providerCustomerId: 'cus_123',
        providerSubscriptionId: 'sub_123',
        status: 'active',
        currentPeriodEnd: '2026-12-01T00:00:00.000Z',
        cancelAtPeriodEnd: false,
        createdAt: '2026-10-31T00:00:00.000Z',
        updatedAt: '2026-10-31T00:00:00.000Z',
      });
    });

    it('muestra el estado activo de suscripción y botones para gestionar en Stripe o cancelar a Starter', async () => {
      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={proUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      // Esperar a que cargue la suscripción mockeada
      await waitFor(() => {
        expect(screen.getByText('Suscripción Stripe Activa')).toBeInTheDocument();
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      });

      // Botón de Customer Portal presente
      expect(screen.getByTestId('customer-portal-btn')).toBeInTheDocument();

      // Botón de cancelar y volver a Starter presente
      expect(screen.getByTestId('cancel-subscription-btn')).toBeInTheDocument();
    });

    it('redirige al Stripe Customer Portal al pulsar "Gestionar en Stripe Customer Portal"', async () => {
      vi.mocked(api.getCustomerPortal).mockResolvedValue({
        url: 'https://billing.stripe.com/p/session/portal_session_123',
      });

      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={proUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('customer-portal-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('customer-portal-btn'));

      await waitFor(() => {
        expect(api.getCustomerPortal).toHaveBeenCalledWith(
          'http://localhost:5173/dashboard',
        );
        expect(window.location.href).toBe(
          'https://billing.stripe.com/p/session/portal_session_123',
        );
      });
    });

    it('cancela la suscripción y vuelve al plan Starter original tras confirmación', async () => {
      vi.mocked(api.cancelSubscription).mockResolvedValue({
        success: true,
        message: 'Suscripción cancelada exitosamente. Tu cuenta ha vuelto al plan STARTER.',
        plan: 'STARTER',
      });
      vi.mocked(api.getMe).mockResolvedValue({
        ...proUser,
        plan: 'STARTER',
      });

      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={proUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      const cancelBtn = await screen.findByTestId('cancel-subscription-btn');
      fireEvent.click(cancelBtn);

      expect(window.confirm).toHaveBeenCalled();

      await waitFor(() => {
        expect(api.cancelSubscription).toHaveBeenCalled();
        expect(api.getMe).toHaveBeenCalled();
        expect(mockOnPlanUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ plan: 'STARTER' }),
        );
      });

      expect(
        screen.getByText(
          'Suscripción cancelada exitosamente. Tu cuenta ha vuelto al plan STARTER.',
        ),
      ).toBeInTheDocument();
    });

    it('no cancela la suscripción si el usuario rechaza la alerta de confirmación', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={proUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      const cancelBtn = await screen.findByTestId('cancel-subscription-btn');
      fireEvent.click(cancelBtn);

      expect(api.cancelSubscription).not.toHaveBeenCalled();
      expect(mockOnPlanUpdated).not.toHaveBeenCalled();
    });
  });

  describe('Escenario 3: Manejo de Errores', () => {
    it('muestra mensaje de alerta si falla la cancelación', async () => {
      vi.mocked(api.getSubscription).mockResolvedValue(null);
      vi.mocked(api.cancelSubscription).mockRejectedValue(
        new Error('Error de conexión con la pasarela de pagos'),
      );

      render(
        <PlanManagementModal
          isOpen={true}
          onClose={mockOnClose}
          currentUser={proUser}
          onPlanUpdated={mockOnPlanUpdated}
        />,
      );

      const cancelBtn = screen.getByTestId('cancel-subscription-btn');
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(
          screen.getByText('Error de conexión con la pasarela de pagos'),
        ).toBeInTheDocument();
      });
    });
  });
});
