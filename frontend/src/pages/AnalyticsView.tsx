import React, { useState, useEffect } from 'react';
import {
  LinkItem,
  api,
  API_BASE_URL,
  User,
} from '../services/api';
import {
  ArrowLeft,
  QrCode,
  Users,
  Smartphone,
  Copy,
  Lock,
  Compass,
  Globe,
  SlidersHorizontal,
  Sparkles,
  Layers,
} from 'lucide-react';

interface AnalyticsViewProps {
  currentUser: User | null;
  linkId?: string | null;
  onBack: () => void;
  onOpenUpgradeModal: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  currentUser,
  linkId,
  onBack,
  onOpenUpgradeModal,
  onShowToast,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '365d'>('7d');
  const [currentLink, setCurrentLink] = useState<LinkItem | null>(null);

  const isPro = (currentUser?.plan || 'STARTER').toUpperCase() === 'PRO';

  useEffect(() => {
    loadData();
  }, [linkId, selectedPeriod]);

  const loadData = async () => {
    try {
      const allLinks = await api.getLinks();
      const target = allLinks.find((l: LinkItem) => l.id === linkId) || allLinks[0] || null;
      setCurrentLink(target);

      if (target) {
        await api.getLinkStats(target.id, selectedPeriod);
      }
    } catch {
      // ignore
    }
  };

  const handleCopyLink = () => {
    if (!currentLink) return;
    const fullUrl = `${API_BASE_URL}/${currentLink.shortCode}`;
    navigator.clipboard.writeText(fullUrl);
    onShowToast(`Copiado kineti.qr/r/${currentLink.shortCode} al portapapeles`, 'success');
  };

  const displaySlug = currentLink ? `kineti.qr/r/${currentLink.shortCode}` : 'kineti.qr/r/menu';
  const displayName = currentLink?.name || 'Menú Digital QR + NFC Mesa';

  return (
    <div className="space-y-4 pb-24">
      {/* 1. Header Row: Back button + Live badge */}
      <div className="flex items-center justify-between text-xs px-1">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-bold tracking-wider text-zinc-300 hover:text-white uppercase text-[11px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ANALÍTICAS</span>
        </button>

        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>En Vivo</span>
        </div>
      </div>

      {/* 2. Title & Short link pill */}
      <div className="space-y-1.5 px-1">
        <h2 className="text-lg font-black text-white tracking-tight">
          {displayName}
        </h2>
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#131620] border border-white/5 text-xs text-zinc-400 hover:text-white transition-colors font-mono"
        >
          <span>{displaySlug}</span>
          <Copy className="w-3 h-3 text-zinc-500" />
        </button>
      </div>

      {/* 3. Period Range Buttons */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#131620] border border-white/5 overflow-x-auto">
        <button
          onClick={() => setSelectedPeriod('7d')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
            selectedPeriod === '7d'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          7 días
        </button>

        {(['30d', '90d', '365d'] as const).map((p) => {
          const label = p === '30d' ? '30 días' : p === '90d' ? '90 días' : '365 días';
          const isSelected = selectedPeriod === p;
          return (
            <button
              key={p}
              onClick={() => {
                if (!isPro) {
                  onOpenUpgradeModal();
                  return;
                }
                setSelectedPeriod(p);
              }}
              className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all ${
                isSelected
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span>{label}</span>
              {!isPro && <Lock className="w-3 h-3 text-amber-400" />}
            </button>
          );
        })}
      </div>

      {/* 4. Four Main KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* KPI 1: TOTAL ESCANEOS */}
        <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>TOTAL ESCANEOS</span>
            <QrCode className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-black text-white">2,410</div>
          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
            <span>↗ +24%</span>
            <span className="text-zinc-500">vs semana ant.</span>
          </div>
        </div>

        {/* KPI 2: VISIT. ÚNICOS */}
        <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>VISIT. ÚNICOS</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">1,894</div>
          <div className="text-[10px] font-semibold text-emerald-400">
            78.5% <span className="text-zinc-500 font-normal">tasa recurrencia</span>
          </div>
        </div>

        {/* KPI 3: DISP. LÍDER */}
        <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>DISP. LÍDER</span>
            <Smartphone className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-base font-bold text-white truncate">iOS (Apple)</div>
          <div className="text-[10px] text-zinc-400">68.4% escaneos</div>
          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: '68.4%' }} />
          </div>
        </div>

        {/* KPI 4: CANAL PRINCIPAL */}
        <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>CANAL PRINCIPAL</span>
            <Compass className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-white">
            <span className="text-amber-400">NFC Físico</span>
            <span>54%</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>Cámara QR</span>
            <span>46%</span>
          </div>
          {/* Dual progress bar */}
          <div className="w-full h-1.5 rounded-full bg-zinc-800 flex overflow-hidden">
            <div className="h-full bg-amber-400" style={{ width: '54%' }} />
            <div className="h-full bg-indigo-500" style={{ width: '46%' }} />
          </div>
        </div>
      </div>

      {/* 5. Actividad Semanal Area Chart */}
      <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-sm font-bold text-white">Actividad Semanal</h4>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Picos en fin de semana (Viernes & Sábado)
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-semibold text-emerald-400 border border-white/5 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            420 scans/día
          </span>
        </div>

        {/* Curved Glowing Area Chart */}
        <div className="relative pt-6 pb-2">
          {/* Tooltip on peak */}
          <div className="absolute top-0 right-16 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shadow-glow-emerald/20 flex items-center gap-1">
            <span>Vie-Sáb: ~420</span>
            <span className="text-emerald-400">↑</span>
          </div>

          <svg viewBox="0 0 400 130" className="w-full h-32 overflow-visible">
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818CF8" stopOpacity="0.45" />
                <stop offset="80%" stopColor="#818CF8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Area Fill */}
            <path
              d="M 10 100 Q 70 85, 130 75 T 250 25 T 320 30 T 390 90 L 390 125 L 10 125 Z"
              fill="url(#areaGradient)"
            />

            {/* Glow Path Line */}
            <path
              d="M 10 100 Q 70 85, 130 75 T 250 25 T 320 30 T 390 90"
              fill="none"
              stroke="#818CF8"
              strokeWidth="2.8"
              strokeLinecap="round"
            />

            {/* High Peak Dots */}
            <circle cx="250" cy="25" r="4.5" fill="#818CF8" stroke="#0B0D13" strokeWidth="2" />
            <circle cx="320" cy="30" r="4.5" fill="#818CF8" stroke="#0B0D13" strokeWidth="2" />
          </svg>

          {/* Days on X Axis */}
          <div className="grid grid-cols-7 text-center text-[11px] text-zinc-500 font-medium pt-1">
            <span>Lun</span>
            <span>Mar</span>
            <span>Mié</span>
            <span>Jue</span>
            <span className="text-white font-bold">Vie</span>
            <span className="text-white font-bold">Sáb</span>
            <span>Dom</span>
          </div>
        </div>
      </div>

      {/* 6. DESGLOSE DE AUDIENCIA */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            DESGLOSE DE AUDIENCIA
          </span>
          <button className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3" />
            <span>Filtrar</span>
          </button>
        </div>

        {/* Card: Sistemas Operativos */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-purple-400" />
              <h5 className="text-xs font-bold text-white">Sistemas Operativos</h5>
            </div>
            <span className="text-[10px] text-zinc-500">Top 3</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Apple iOS</span>
                <span className="font-bold text-white">68%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-indigo-400 rounded-full" style={{ width: '68%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Google Android</span>
                <span className="font-bold text-white">29%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: '29%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-400 mb-1">
                <span>Otros</span>
                <span className="font-bold text-zinc-300">3%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-zinc-600 rounded-full" style={{ width: '3%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card: Navegadores */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <h5 className="text-xs font-bold text-white">Navegadores</h5>
            </div>
            <span className="text-[10px] text-zinc-500">In-App & Móvil</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Mobile Safari</span>
                <span className="font-bold text-amber-400">65%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: '65%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Chrome Mobile</span>
                <span className="font-bold text-indigo-400">31%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-indigo-400 rounded-full" style={{ width: '31%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-400 mb-1">
                <span>Firefox Mobile</span>
                <span className="font-bold text-zinc-300">4%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-zinc-600 rounded-full" style={{ width: '4%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card: Países y Regiones */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <h5 className="text-xs font-bold text-white">Países y Regiones</h5>
            </div>
            <span className="text-[10px] text-emerald-400">Geolocalización IP</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <span>🇭🇳</span>
                  <span>Honduras</span>
                </span>
                <span className="font-bold text-emerald-400">52%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: '52%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <span>🇺🇸</span>
                  <span>Estados Unidos</span>
                </span>
                <span className="font-bold text-indigo-400">24%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-indigo-400 rounded-full" style={{ width: '24%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <span>🇲🇽</span>
                  <span>México</span>
                </span>
                <span className="font-bold text-amber-400">14%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: '14%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span className="flex items-center gap-1.5">
                  <span>🇪🇸</span>
                  <span>España</span>
                </span>
                <span className="font-bold text-rose-400">10%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-rose-400 rounded-full" style={{ width: '10%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Card: Puntos de Captura */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h5 className="text-xs font-bold text-white">Puntos de Captura</h5>
            </div>
            <span className="text-[10px] text-zinc-500">Hardware NFC</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Placa NFC Mostrador</span>
                <span className="font-bold text-indigo-400">48%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-indigo-400 rounded-full" style={{ width: '48%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>Stand Acrílico Mesa</span>
                <span className="font-bold text-amber-400">32%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: '32%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-zinc-300 mb-1">
                <span>QR Carta Impreso</span>
                <span className="font-bold text-zinc-400">20%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-zinc-600 rounded-full" style={{ width: '20%' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 7. Active Hardware Card */}
      <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 flex items-center gap-3">
        <div className="h-14 w-14 rounded-xl overflow-hidden bg-black/50 border border-white/10 shrink-0 relative">
          <img
            src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=160&auto=format&fit=crop&q=80"
            alt="Hardware Activo"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded-full uppercase">
            <span>HARDWARE ACTIVO</span>
          </div>
          <h5 className="text-xs font-bold text-white truncate mt-0.5">
            Mesa Central - Pack Acrílico v2
          </h5>
          <p className="text-[10px] text-zinc-400">
            Último pulso NFC: Hace 4 min
          </p>
        </div>
      </div>

      {/* 8. Card PRO: Exportación & Conexión GA4 */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1C1726] to-[#131620] border border-amber-500/25 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-amber-400/20 text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                POTENCIA TUS DATOS
              </span>
              <h4 className="text-sm font-bold text-white">
                Exportación & Conexión GA4
              </h4>
            </div>
          </div>

          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 uppercase">
            PLAN PRO
          </span>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Exporta informes completos en formato PDF / CSV y sincroniza automáticamente los eventos de escaneo físico directo con Google Analytics 4.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onOpenUpgradeModal}
            className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-glow-gold/20 flex items-center justify-center transition-all"
          >
            Activar Plan PRO
          </button>
          <button
            onClick={() => onShowToast('Generando vista previa de reporte PDF...', 'info')}
            className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 font-semibold text-xs transition-colors"
          >
            Ver Muestra
          </button>
        </div>
      </div>
    </div>
  );
};
