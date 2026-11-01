import { useEffect, useState } from 'react';
import { api, User } from './services/api';
import { Navbar } from './components/Navbar';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { StripeSandboxPage } from './pages/StripeSandboxPage';
import { PlanManagementModal } from './components/PlanManagementModal';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export function App() {
  const [user, setUser] = useState<User | null>(() => api.getCurrentUser());
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<{
    type: 'success' | 'cancelled';
    message: string;
  } | null>(null);

  const token = localStorage.getItem('token');
  const isAuthenticated = Boolean(token && user);
  const sandboxMode = new URLSearchParams(window.location.search).get(
    'stripe_sandbox',
  );

  useEffect(() => {
    // Detectar retorno desde Stripe Checkout (?payment=success|cancelled o ?order=success|cancelled)
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const orderStatus = params.get('order');

    if (paymentStatus === 'success') {
      setPaymentNotice({
        type: 'success',
        message: '¡Pago completado con éxito! Tu plan ha sido actualizado a PRO.',
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'cancelled') {
      setPaymentNotice({
        type: 'cancelled',
        message: 'Sesión de pago cancelada. Puedes retomar el cambio de plan cuando desees.',
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (orderStatus === 'success') {
      setPaymentNotice({
        type: 'success',
        message: '¡Orden de hardware NFC/QR confirmada con éxito! Tu pedido ha pasado a cola de manufactura.',
      });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (orderStatus === 'cancelled') {
      setPaymentNotice({
        type: 'cancelled',
        message: 'Solicitud de pedido físico cancelada.',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Sincronizar perfil y rotar JWT con el plan vigente en PostgreSQL
    if (token) {
      api
        .getMe()
        .then((updated) => {
          if (updated) setUser(updated);
        })
        .catch(() => {});
    }
  }, [token]);

  const handleAuthSuccess = (authenticatedUser: User) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  const handlePlanUpdated = (updatedUser: User) => {
    setUser(updatedUser);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {paymentNotice && (
        <div
          className={`px-4 py-2.5 text-xs font-medium flex items-center justify-between transition-colors ${
            paymentNotice.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-amber-500 text-white'
          }`}
        >
          <div className="mx-auto max-w-5xl flex items-center gap-2">
            {paymentNotice.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{paymentNotice.message}</span>
          </div>
          <button
            onClick={() => setPaymentNotice(null)}
            className="text-white/80 hover:text-white font-bold text-sm px-2"
          >
            ×
          </button>
        </div>
      )}

      {isAuthenticated &&
      (sandboxMode === 'checkout' || sandboxMode === 'portal') ? (
        <StripeSandboxPage currentUser={user} />
      ) : isAuthenticated ? (
        <>
          <Navbar
            user={user}
            onLogout={handleLogout}
            onOpenPlans={() => setIsPlanModalOpen(true)}
          />
          <DashboardPage
            currentUser={user}
            onOpenPlans={() => setIsPlanModalOpen(true)}
          />
          <PlanManagementModal
            isOpen={isPlanModalOpen}
            onClose={() => setIsPlanModalOpen(false)}
            currentUser={user}
            onPlanUpdated={handlePlanUpdated}
          />
        </>
      ) : (
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}

export default App;
