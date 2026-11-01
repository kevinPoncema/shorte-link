import React, { useEffect, useState } from 'react';
import {
  Check,
  Sparkles,
  Zap,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  X,
  CreditCard,
  RotateCcw,
} from 'lucide-react';
import { api, Subscription, User } from '../services/api';

interface PlanManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onPlanUpdated: (updatedUser: User) => void;
}

export const PlanManagementModal: React.FC<PlanManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onPlanUpdated,
}) => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const currentPlan = (currentUser?.plan || 'STARTER').toUpperCase();
  const isPro = currentPlan === 'PRO';

  useEffect(() => {
    if (isOpen) {
      loadSubscription();
      setError(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  const loadSubscription = async () => {
    setLoading(true);
    try {
      const sub = await api.getSubscription();
      setSubscription(sub);
    } catch (err: any) {
      console.warn('No se pudo obtener la suscripción externa:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Iniciar checkout de Stripe para cambiar a PRO
  const handleUpgradeWithStripe = async () => {
    setActionLoading('stripe');
    setError(null);
    setSuccessMessage(null);
    try {
      const currentUrl = window.location.origin + window.location.pathname;
      const res = await api.createSubscriptionCheckout({
        successUrl: `${currentUrl}?payment=success`,
        cancelUrl: `${currentUrl}?payment=cancelled`,
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar Stripe Checkout');
      setActionLoading(null);
    }
  };

  // Simulación rápida directa para desarrollo / pruebas locales sin stripe webhook forwarder
  const handleSimulateUpgrade = async () => {
    setActionLoading('simulate');
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.simulateUpgradeToPro();
      setSuccessMessage(res.message || '¡Plan actualizado a PRO exitosamente!');
      await refreshUserProfile();
      await loadSubscription();
    } catch (err: any) {
      setError(err?.message || 'Error al cambiar a PRO');
    } finally {
      setActionLoading(null);
    }
  };

  // Redirigir a Stripe Customer Portal
  const handleOpenCustomerPortal = async () => {
    setActionLoading('portal');
    setError(null);
    setSuccessMessage(null);
    try {
      const currentUrl = window.location.origin + window.location.pathname;
      const res = await api.getCustomerPortal(currentUrl);
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setError(err?.message || 'Error al abrir Stripe Customer Portal');
      setActionLoading(null);
    }
  };

  // Cancelar suscripción y volver al plan Starter original
  const handleCancelSubscription = async () => {
    const confirmed = window.confirm(
      '¿Estás seguro de que deseas cancelar tu suscripción PRO y volver al plan STARTER original? Las cuotas ilimitadas se restablecerán a la cuota gratuita.',
    );
    if (!confirmed) return;

    setActionLoading('cancel');
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.cancelSubscription();
      setSuccessMessage(res.message || 'Suscripción cancelada. Has vuelto al plan STARTER.');
      await refreshUserProfile();
      await loadSubscription();
    } catch (err: any) {
      setError(err?.message || 'Error al cancelar la suscripción');
    } finally {
      setActionLoading(null);
    }
  };

  const refreshUserProfile = async () => {
    try {
      const updatedUser = await api.getMe();
      if (updatedUser) {
        onPlanUpdated(updatedUser);
      }
    } catch {
      if (currentUser) {
        const fallback = {
          ...currentUser,
          plan: isPro ? 'STARTER' : 'PRO',
        };
        localStorage.setItem('user', JSON.stringify(fallback));
        onPlanUpdated(fallback);
      }
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="border-b border-slate-100 px-6 py-5 flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="plan-modal-title" className="text-lg font-bold text-slate-900">
                Planes y Facturación
              </h2>
              <p className="text-xs text-slate-500">
                Administra tu nivel de suscripción, cuotas de enlaces y códigos QR dinámicos.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Alerts */}
          {error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Estado de Suscripción Actual si es PRO */}
          {loading && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-400 flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <span>Sincronizando estado de suscripción...</span>
            </div>
          )}

          {!loading && isPro && subscription && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-indigo-900 flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-indigo-600" />
                  Suscripción Stripe Activa
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-800">
                  {subscription.status.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                {subscription.currentPeriodEnd && (
                  <div>
                    <span className="text-slate-400">Próxima renovación: </span>
                    <span className="font-medium text-slate-800">
                      {formatDate(subscription.currentPeriodEnd)}
                    </span>
                  </div>
                )}
                {subscription.providerCustomerId && (
                  <div>
                    <span className="text-slate-400">Cliente Stripe: </span>
                    <code className="font-mono text-[11px] bg-indigo-100/60 px-1.5 py-0.5 rounded text-indigo-800">
                      {subscription.providerCustomerId}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cards de Planes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* PLAN STARTER (Original) */}
            <div
              className={`relative rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                !isPro
                  ? 'border-indigo-600 ring-2 ring-indigo-600/10 bg-white shadow-md'
                  : 'border-slate-200 bg-slate-50/50 opacity-90'
              }`}
            >
              <div>
                {!isPro && (
                  <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 mb-3">
                    Plan Actual
                  </span>
                )}
                <h3 className="text-base font-bold text-slate-900">Plan Starter</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Ideal para probar enlaces cortos y proyectos personales.
                </p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">$0</span>
                  <span className="text-xs text-slate-500 font-medium">/ mes gratis</span>
                </div>

                <ul className="mt-5 space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Hasta <strong>5 enlaces dinámicos</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Redirección ultrarrápida con Redis RAM</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Descarga de códigos QR estándar</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>Métricas resumidas de clics</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                {!isPro ? (
                  <button
                    disabled
                    className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-400 cursor-default"
                  >
                    Tu Plan Activo
                  </button>
                ) : (
                  <button
                    onClick={handleCancelSubscription}
                    disabled={actionLoading !== null}
                    data-testid="cancel-subscription-btn"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors focus:ring-2 focus:ring-red-400"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${actionLoading === 'cancel' ? 'animate-spin' : ''}`} />
                    <span>{actionLoading === 'cancel' ? 'Cancelando...' : 'Cancelar PRO y volver a Starter'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* PLAN PRO */}
            <div
              className={`relative rounded-2xl border p-5 transition-all flex flex-col justify-between ${
                isPro
                  ? 'border-indigo-600 ring-2 ring-indigo-600/10 bg-white shadow-md'
                  : 'border-indigo-200 bg-gradient-to-b from-indigo-50/40 to-white shadow-sm hover:border-indigo-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                    <Zap className="h-3 w-3 fill-current" />
                    Recomendado
                  </span>
                  {isPro && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                      Plan Actual Activo
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900">Plan PRO</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Capacidad ilimitada, analíticas completas y personalización avanzada.
                </p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-indigo-600">$19</span>
                  <span className="text-xs text-slate-500 font-medium">/ mes</span>
                </div>

                <ul className="mt-5 space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-600 shrink-0 font-bold" />
                    <span><strong>Enlaces y códigos QR ilimitados</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>Personalización visual de colores y corrección de error</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>Analíticas por dispositivo, país, navegador y timeline</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>Descarga vectorial en SVG y PNG de alta resolución</span>
                  </li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
                {!isPro ? (
                  <>
                    <button
                      onClick={handleUpgradeWithStripe}
                      disabled={actionLoading !== null}
                      data-testid="upgrade-stripe-btn"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-70"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>{actionLoading === 'stripe' ? 'Abriendo Stripe...' : 'Mejorar a PRO con Stripe Checkout'}</span>
                    </button>

                    <button
                      onClick={handleSimulateUpgrade}
                      disabled={actionLoading !== null}
                      data-testid="simulate-upgrade-btn"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 py-2 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-70"
                      title="Activar plan PRO directamente sin pasarela externa (Modo pruebas)"
                    >
                      <Zap className="h-3 w-3" />
                      <span>{actionLoading === 'simulate' ? 'Activando...' : 'Activar PRO Directo (Modo Pruebas / Dev)'}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleOpenCustomerPortal}
                      disabled={actionLoading !== null}
                      data-testid="customer-portal-btn"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm focus:ring-2 focus:ring-slate-700 focus:ring-offset-1 disabled:opacity-70"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>{actionLoading === 'portal' ? 'Cargando portal...' : 'Gestionar en Stripe Customer Portal'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3.5 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Cancelación disponible en cualquier momento sin penalizaciones.</span>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-white transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
