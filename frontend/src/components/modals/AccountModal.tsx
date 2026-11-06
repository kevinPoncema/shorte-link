import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Zap,
  Check,
  CreditCard,
  ExternalLink,
  RotateCcw,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { api, User } from '../../services/api';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
  onLogout,
}) => {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isPro = (currentUser?.plan || 'STARTER').toUpperCase() === 'PRO';

  if (!isOpen) return null;

  const handleUpgradeStripe = async () => {
    setActionLoading('stripe');
    setError(null);
    try {
      const origin = window.location.origin + window.location.pathname;
      const res = await api.createSubscriptionCheckout({
        successUrl: `${origin}?payment=success`,
        cancelUrl: `${origin}?payment=cancelled`,
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar Stripe Checkout');
      setActionLoading(null);
    }
  };

  const handleSimulateUpgrade = async () => {
    setActionLoading('simulate');
    setError(null);
    try {
      await api.simulateUpgradeToPro();
      setSuccess('¡Plan actualizado a PRO exitosamente!');
      const updated = await api.getMe();
      if (updated) onUserUpdated(updated);
    } catch (err: any) {
      setError(err?.message || 'Error al cambiar a PRO');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCustomerPortal = async () => {
    setActionLoading('portal');
    setError(null);
    try {
      const origin = window.location.origin + window.location.pathname;
      const res = await api.getCustomerPortal(origin);
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      setError(err?.message || 'Error al abrir Customer Portal');
      setActionLoading(null);
    }
  };

  const handleCancelSub = async () => {
    if (!window.confirm('¿Deseas cancelar tu suscripción PRO y volver al Plan Starter?')) return;
    setActionLoading('cancel');
    setError(null);
    try {
      const res = await api.cancelSubscription();
      setSuccess(res.message || 'Suscripción cancelada. Has vuelto a STARTER.');
      const updated = await api.getMe();
      if (updated) onUserUpdated(updated);
    } catch (err: any) {
      setError(err?.message || 'Error al cancelar la suscripción');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#131620] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-[#131620] to-[#1A1E2D]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-glow-gold/10">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Cuenta y Planes SaaS
              </h2>
              <p className="text-xs text-zinc-400">
                {currentUser?.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {error && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          {/* Nota Prototipo Técnico y Sin Cobro */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-200">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-amber-300 block">
                Aviso: Prototipo Técnico de Demostración
              </span>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Este sistema opera en modo prototipo técnico para pruebas y validación. No se efectuará ningún cobro monetario real a tu tarjeta ni se realizará ningún envío físico de materiales.
              </p>
            </div>
          </div>

          {/* Current Plan Badge Card */}
          <div className="p-4 rounded-2xl bg-[#0B0D13] border border-white/5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Nivel Actual
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-base font-extrabold ${isPro ? 'text-amber-400' : 'text-white'}`}>
                  {isPro ? 'Plan PRO Studio' : 'Plan Starter (Básico)'}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isPro ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-300'
                }`}>
                  {isPro ? 'Activo' : '3 Enlaces'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-zinc-400">
                {isPro ? '$19.00 / mes' : 'Gratis'}
              </span>
            </div>
          </div>

          {/* Upgrade Card */}
          {!isPro ? (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1E1B2E] via-[#161726] to-[#131620] border border-amber-500/30 shadow-glow-gold/10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-amber-400/20 text-amber-400">
                    <Zap className="w-4 h-4" />
                  </span>
                  <span className="text-sm font-bold text-white">Desbloquear Plan PRO</span>
                </div>
                <span className="text-xs font-bold text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                  $19 / mes
                </span>
              </div>

              <ul className="space-y-2 text-xs text-zinc-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Hasta <strong>50 enlaces dinámicos activos</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Estilo & Marca: colores hex y logo central SVG</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Analíticas avanzadas de 365 días y exportación</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Descarga vectorial en SVG / 4K para serigrafía</span>
                </li>
              </ul>

              <div className="pt-2 space-y-2">
                <button
                  onClick={handleUpgradeStripe}
                  disabled={actionLoading !== null}
                  className="w-full py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>{actionLoading === 'stripe' ? 'Abriendo Stripe...' : 'Subir a PRO con Stripe ($19/mes)'}</span>
                </button>

                <button
                  onClick={handleSimulateUpgrade}
                  disabled={actionLoading !== null}
                  className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-amber-400 border border-amber-500/20 text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{actionLoading === 'simulate' ? 'Activando...' : 'Activar PRO Directo (Modo Pruebas / Dev)'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#0B0D13] border border-white/5 space-y-3 text-xs">
              <div className="flex items-center justify-between text-zinc-300">
                <span>Estado de Facturación:</span>
                <span className="text-emerald-400 font-semibold">Al día (Renovación mensual)</span>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCustomerPortal}
                  disabled={actionLoading !== null}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Stripe Customer Portal</span>
                </button>
                <button
                  onClick={handleCancelSub}
                  disabled={actionLoading !== null}
                  className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold text-xs transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Logout Section */}
          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar Sesión</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
