import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Lock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  RotateCcw,
  Package,
  Zap,
} from 'lucide-react';
import { api, User } from '../services/api';

interface StripeSandboxPageProps {
  currentUser: User | null;
}

export const StripeSandboxPage: React.FC<StripeSandboxPageProps> = ({
  currentUser,
}) => {
  const params = new URLSearchParams(window.location.search);
  const sandboxType = params.get('stripe_sandbox') || 'checkout';
  const mode = (params.get('mode') as 'subscription' | 'payment') || 'subscription';
  const orderId = params.get('orderId') || undefined;
  const sessionId = params.get('sessionId') || undefined;
  const amount = params.get('amount') || (mode === 'subscription' ? '19.00' : '15.00');
  const title =
    params.get('title') ||
    (mode === 'subscription'
      ? 'Plan PRO — Suscripción Mensual'
      : 'Placa o Tarjeta QR + NFC');
  const subtitle =
    params.get('subtitle') ||
    (mode === 'subscription'
      ? 'Hasta 50 enlaces dinámicos activos, colores QR personalizados y 365 días de analíticas'
      : 'Impresión física con chip NFC integrado y envío estándar incluido');
  const qty = Number(params.get('qty') || '1');
  const successUrl =
    params.get('successUrl') ||
    `${window.location.origin}/?${mode === 'subscription' ? 'payment=success' : 'order=success'}`;
  const cancelUrl =
    params.get('cancelUrl') ||
    `${window.location.origin}/?${mode === 'subscription' ? 'payment=cancelled' : 'order=cancelled'}`;
  const returnUrl = params.get('returnUrl') || `${window.location.origin}/`;

  // Estados del formulario de tarjeta estilo Stripe Checkout
  const [email, setEmail] = useState(currentUser?.email || 'cliente@empresa.com');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/29');
  const [cvc, setCvc] = useState('424');
  const [cardholderName, setCardholderName] = useState('Cliente QR Maker');
  const [country, setCountry] = useState('HN');

  const [processing, setProcessing] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCardNumber = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiry = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  const fillTestCard = (type: 'success' | 'decline') => {
    setError(null);
    if (type === 'success') {
      setCardNumber('4242 4242 4242 4242');
      setExpiry('12/29');
      setCvc('424');
    } else {
      setCardNumber('4000 0000 0000 0002');
      setExpiry('12/29');
      setCvc('002');
    }
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCard = cardNumber.replace(/\s+/g, '');
    if (cleanCard.length < 15) {
      setError('El número de tarjeta está incompleto. Usa 16 dígitos (ej. 4242 4242 4242 4242).');
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) {
      setError('Ingresa una fecha de vencimiento válida en formato MM/AA.');
      return;
    }
    if (cvc.trim().length < 3) {
      setError('El código CVC debe tener al menos 3 dígitos.');
      return;
    }
    if (!cardholderName.trim()) {
      setError('Ingresa el nombre del titular de la tarjeta.');
      return;
    }

    // Simular tarjeta de prueba de rechazo oficial de Stripe (4000 0000 0000 0002)
    if (cleanCard.endsWith('0002')) {
      setProcessing(true);
      setTimeout(() => {
        setProcessing(false);
        setError(
          'Tu tarjeta fue rechazada por el banco emisor (card_declined). Prueba con la tarjeta 4242 4242 4242 4242.',
        );
      }, 650);
      return;
    }

    setProcessing(true);
    try {
      await api.completeSandboxCheckout({
        mode,
        orderId,
        sessionId,
      });
      setApproved(true);
      setTimeout(() => {
        window.location.href = successUrl;
      }, 900);
    } catch (err: any) {
      setError(
        err?.message || 'No se pudo procesar el pago. Intenta nuevamente.',
      );
      setProcessing(false);
    }
  };

  const handlePortalCancel = async () => {
    if (
      !window.confirm(
        '¿Confirmas que deseas cancelar tu suscripción PRO y volver al Plan Starter gratuito?',
      )
    ) {
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      await api.cancelSubscription();
      window.location.href = returnUrl;
    } catch (err: any) {
      setError(err?.message || 'Error al cancelar la suscripción.');
      setProcessing(false);
    }
  };

  // =========================================================================
  // VISTA 1: STRIPE CUSTOMER PORTAL SANDBOX (?stripe_sandbox=portal)
  // =========================================================================
  if (sandboxType === 'portal') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => (window.location.href = returnUrl)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver a QR Maker</span>
            </button>
            <span className="rounded bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Stripe Test Mode
            </span>
          </div>
          <span className="text-xs font-semibold tracking-tight text-slate-300">
            Stripe Billing Portal
          </span>
        </header>

        <main className="mx-auto w-full max-w-2xl p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Suscripción Actual
                </span>
                <h1 className="text-lg font-bold text-slate-900 mt-0.5">
                  Plan PRO — QR Maker SaaS
                </h1>
                <p className="text-xs text-slate-500">$19.00 USD / mes • Renovación automática</p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                Activa
              </span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-600 py-2">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-slate-400" />
                <span>Método de pago predeterminado:</span>
              </div>
              <strong className="text-slate-900">Visa terminada en •••• 4242</strong>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => (window.location.href = returnUrl)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Conservar Plan PRO
              </button>
              <button
                onClick={handlePortalCancel}
                disabled={processing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>
                  {processing ? 'Cancelando...' : 'Cancelar suscripción y volver a Starter'}
                </span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // VISTA 2: STRIPE CHECKOUT UI (?stripe_sandbox=checkout)
  // =========================================================================
  const unitPrice = qty > 0 ? (Number(amount) / qty).toFixed(2) : amount;

  return (
    <div
      data-testid="stripe-sandbox-checkout"
      className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white font-sans"
    >
      {/* Columna Izquierda: Resumen del Comercio y Producto (Estilo Stripe Checkout) */}
      <div className="bg-slate-900 text-white px-6 py-10 lg:px-16 lg:py-14 flex flex-col justify-between">
        <div className="max-w-md mx-auto w-full space-y-8">
          {/* Barra superior comercio + botón volver */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => (window.location.href = cancelUrl)}
              className="group inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <span className="font-bold text-white tracking-tight">QR Maker</span>
            </button>
            <span className="rounded-md bg-amber-400/15 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Modo Prueba (Sandbox)
            </span>
          </div>

          {/* Precio Principal */}
          <div>
            <p className="text-xs font-medium text-slate-400">
              {mode === 'subscription'
                ? 'Suscribirse a Plan PRO'
                : 'Pago de pedido físico QR + NFC'}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold tracking-tight text-white">
                ${Number(amount).toFixed(2)}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {mode === 'subscription' ? 'USD / mes' : 'USD (pago único)'}
              </span>
            </div>
          </div>

          {/* Desglose de líneas */}
          <div className="rounded-2xl border border-slate-800 bg-slate-800/50 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#635BFF]/20 text-[#9993FF] border border-[#635BFF]/30">
                  {mode === 'subscription' ? (
                    <Zap className="h-4 w-4" />
                  ) : (
                    <Package className="h-4 w-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                    {subtitle}
                  </p>
                  {mode === 'payment' && qty > 1 && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Cantidad: {qty} × ${unitPrice} USD
                    </p>
                  )}
                </div>
              </div>
              <span className="text-sm font-bold text-white shrink-0">
                ${Number(amount).toFixed(2)}
              </span>
            </div>

            <div className="border-t border-slate-700/70 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>${Number(amount).toFixed(2)} USD</span>
              </div>
              {mode === 'payment' && (
                <div className="flex justify-between text-emerald-400">
                  <span>Envío estándar asegurado</span>
                  <span>Gratis ($0.00)</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-700/70">
                <span>Total a pagar hoy</span>
                <span>${Number(amount).toFixed(2)} USD</span>
              </div>
            </div>
          </div>

          {/* Nota informativa para llaves reales de Stripe */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Pasarela Sandbox Activa:</strong>{' '}
            Tu archivo <code className="text-amber-300">.env</code> usa actualmente una clave
            mock (<code className="text-slate-300">sk_test_51Mock...</code>). Para usar{' '}
            <code className="text-slate-300">checkout.stripe.com</code> en vivo, reemplaza{' '}
            <code className="text-amber-300">STRIPE_SECRET_KEY</code> por tu clave{' '}
            <code className="text-slate-300">sk_test_...</code> de Stripe Dashboard.
          </div>
        </div>

        <div className="max-w-md mx-auto w-full pt-8 flex items-center justify-between text-[11px] text-slate-500">
          <span>Powered by <strong className="text-slate-300">stripe</strong></span>
          <div className="flex gap-3">
            <span>Condiciones</span>
            <span>Privacidad</span>
          </div>
        </div>
      </div>

      {/* Columna Derecha: Formulario de Pago con Tarjeta */}
      <div className="px-6 py-10 lg:px-16 lg:py-14 flex items-center justify-center bg-white">
        <div className="max-w-md w-full space-y-6">
          {approved ? (
            <div className="py-16 text-center space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                ¡Pago aprobado con éxito!
              </h2>
              <p className="text-xs text-slate-500">
                Redirigiendo automáticamente de regreso a QR Maker...
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Pagar con tarjeta
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => fillTestCard('success')}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    Tarjeta 4242 (Éxito)
                  </button>
                  <button
                    type="button"
                    onClick={() => fillTestCard('decline')}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                  >
                    Tarjeta 0002 (Rechazo)
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handlePaySubmit} className="space-y-4">
                {/* Correo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50/60 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#635BFF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20"
                  />
                </div>

                {/* Bloque de Tarjeta Agrupado estilo Stripe */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Información de la tarjeta
                  </label>
                  <div className="rounded-xl border border-slate-300 overflow-hidden shadow-2xs focus-within:border-[#635BFF] focus-within:ring-2 focus-within:ring-[#635BFF]/20">
                    <div className="relative flex items-center border-b border-slate-200 bg-white px-3.5 py-2.5">
                      <CreditCard className="h-4 w-4 text-slate-400 mr-2.5 shrink-0" />
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                        placeholder="1234 1234 1234 1234"
                        className="w-full text-sm font-mono text-slate-900 focus:outline-none"
                      />
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-extrabold text-blue-800">
                          VISA
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-extrabold text-orange-600">
                          MC
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-200 bg-white">
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={expiry}
                        onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                        placeholder="MM / AA"
                        className="px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={4}
                        value={cvc}
                        onChange={(e) =>
                          setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        placeholder="CVC"
                        className="px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Titular */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nombre del titular de la tarjeta
                  </label>
                  <input
                    type="text"
                    required
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="Nombre completo como aparece en la tarjeta"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#635BFF] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20"
                  />
                </div>

                {/* País */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    País o región
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#635BFF] focus:outline-none focus:ring-2 focus:ring-[#635BFF]/20"
                  >
                    <option value="HN">Honduras</option>
                    <option value="US">Estados Unidos</option>
                    <option value="MX">México</option>
                    <option value="ES">España</option>
                    <option value="GT">Guatemala</option>
                    <option value="SV">El Salvador</option>
                    <option value="CR">Costa Rica</option>
                    <option value="CO">Colombia</option>
                  </select>
                </div>

                {/* Botón Principal Stripe Blurple */}
                <button
                  type="submit"
                  disabled={processing}
                  data-testid="stripe-sandbox-submit"
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#635BFF] py-3.5 px-4 text-sm font-semibold text-white shadow-md shadow-[#635BFF]/25 hover:bg-[#5249f5] transition-all focus:outline-none focus:ring-2 focus:ring-[#635BFF] focus:ring-offset-2 disabled:opacity-70"
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Procesando pago seguro...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" />
                      <span>
                        {mode === 'subscription'
                          ? `Suscribirse — $${Number(amount).toFixed(2)} USD`
                          : `Pagar $${Number(amount).toFixed(2)} USD`}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={processing}
                  onClick={() => (window.location.href = cancelUrl)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar y volver a QR Maker
                </button>

                <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Transacción protegida con cifrado SSL/TLS de 256 bits</span>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
