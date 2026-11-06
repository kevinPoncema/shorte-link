import React, { useState, useEffect } from 'react';
import {
  LinkItem,
  LinkStatsResponse,
  OrderRecord,
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
  Sparkles,
  Layers,
  BarChart2,
  Search,
  X,
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
  const [allLinks, setAllLinks] = useState<LinkItem[]>([]);
  const [currentLink, setCurrentLink] = useState<LinkItem | null>(null);
  const [linkFilterQuery, setLinkFilterQuery] = useState('');
  const [stats, setStats] = useState<LinkStatsResponse | null>(null);
  const [hardwareOrder, setHardwareOrder] = useState<OrderRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isPro = (currentUser?.plan || 'STARTER').toUpperCase() === 'PRO';

  useEffect(() => {
    loadData();
  }, [linkId, selectedPeriod]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const links = await api.getLinks();
      setAllLinks(links);

      const target = links.find((l: LinkItem) => l.id === linkId) || links[0] || null;
      setCurrentLink(target);

      if (target) {
        const statsData = await api.getLinkStats(target.id, selectedPeriod);
        setStats(statsData);
      } else {
        setStats(null);
      }

      // Load hardware orders to verify if real physical tags exist
      try {
        const orders = await api.getPhysicalOrders();
        const matchingOrder = orders.find((o) =>
          target ? o.items?.some((i) => i.linkId === target.id) : false
        ) || orders[0] || null;
        setHardwareOrder(matchingOrder);
      } catch {
        setHardwareOrder(null);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!currentLink) return;
    const fullUrl = `${API_BASE_URL}/${currentLink.shortCode}`;
    navigator.clipboard.writeText(fullUrl);
    onShowToast(`Copiado kineti.qr/r/${currentLink.shortCode} al portapapeles`, 'success');
  };

  const handleSelectLink = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = allLinks.find((l) => l.id === e.target.value) || null;
    setCurrentLink(selected);
    if (selected) {
      api.getLinkStats(selected.id, selectedPeriod).then(setStats).catch(() => setStats(null));
    }
  };

  if (!isLoading && (!currentLink || allLinks.length === 0)) {
    return (
      <div className="space-y-4 pb-24">
        <div className="flex items-center justify-between text-xs px-1">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 font-bold tracking-wider text-zinc-300 hover:text-white uppercase text-[11px] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ANALÍTICAS</span>
          </button>
        </div>

        <div className="p-8 rounded-2xl bg-[#131620] border border-white/5 text-center space-y-4 my-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto text-indigo-400">
            <BarChart2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No tienes enlaces creados todavía</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Crea tu primer enlace dinámico en el Editor QR para comenzar a capturar escaneos, dispositivos y telemetría en tiempo real.
            </p>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
          >
            <QrCode className="w-4 h-4" />
            <span>Ir al Editor QR</span>
          </button>
        </div>
      </div>
    );
  }

  const displayName = currentLink?.name || 'Enlace sin título';
  const displaySlug = currentLink ? `kineti.qr/r/${currentLink.shortCode}` : '';

  const totalClicks = stats?.summary?.totalClicks ?? 0;
  const uniqueVisitors = stats?.summary?.uniqueVisitors ?? 0;
  const topDevice = stats?.summary?.topDevice || (totalClicks > 0 ? 'Sin clasificar' : 'Sin registros');

  const recurrenceRate = totalClicks > 0
    ? `${Math.min(100, Math.round((uniqueVisitors / totalClicks) * 100))}%`
    : '0%';

  const topOs = stats?.breakdowns?.os?.[0] || null;
  const topOsPercent = topOs ? Math.round(topOs.percentage) : 0;

  const topReferrer = stats?.breakdowns?.referrers?.[0] || null;
  const secondReferrer = stats?.breakdowns?.referrers?.[1] || null;

  // Timeline computation
  const timelinePoints = stats?.timeline || [];
  const maxTimelineClicks = timelinePoints.length > 0
    ? Math.max(...timelinePoints.map((t) => t.clicks), 0)
    : 0;

  const avgDailyClicks = timelinePoints.length > 0 && totalClicks > 0
    ? Math.round(totalClicks / timelinePoints.length)
    : 0;

  const peakPoint = timelinePoints.reduce((max, cur) => (cur.clicks > max.clicks ? cur : max), {
    date: '',
    clicks: 0,
  });

  // Calculate SVG curve coordinates
  const svgWidth = 400;
  const svgHeight = 120;
  const paddingX = 20;
  const paddingY = 20;
  const innerWidth = svgWidth - paddingX * 2;
  const innerHeight = svgHeight - paddingY * 2;

  const pathCoords = timelinePoints.map((pt, idx) => {
    const x = paddingX + (idx / Math.max(timelinePoints.length - 1, 1)) * innerWidth;
    const y = maxTimelineClicks > 0
      ? paddingY + innerHeight - (pt.clicks / maxTimelineClicks) * innerHeight
      : paddingY + innerHeight;
    return { x, y, clicks: pt.clicks, date: pt.date };
  });

  const linePathD = pathCoords.length > 0
    ? pathCoords.reduce((acc, curr, idx) => (idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`), '')
    : `M ${paddingX} ${paddingY + innerHeight} L ${svgWidth - paddingX} ${paddingY + innerHeight}`;

  const areaPathD = pathCoords.length > 0
    ? `${linePathD} L ${pathCoords[pathCoords.length - 1].x} ${svgHeight} L ${pathCoords[0].x} ${svgHeight} Z`
    : '';

  const getCountryEmoji = (code: string) => {
    const clean = code.toUpperCase();
    if (clean === 'HN') return '🇭🇳';
    if (clean === 'US') return '🇺🇸';
    if (clean === 'MX') return '🇲🇽';
    if (clean === 'ES') return '🇪🇸';
    if (clean === 'GT') return '🇬🇹';
    if (clean === 'CR') return '🇨🇷';
    if (clean === 'CO') return '🇨🇴';
    return '🌐';
  };

  const filteredSelectorLinks = allLinks.filter((l) => {
    const term = linkFilterQuery.trim().toLowerCase();
    if (!term) return true;
    return (
      (l.name || '').toLowerCase().includes(term) ||
      l.shortCode.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-4 pb-24">
      {/* 1. Header Row: Back button + Live badge */}
      <div className="flex items-center justify-between text-xs px-1 gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-bold tracking-wider text-zinc-300 hover:text-white uppercase text-[11px] transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ANALÍTICAS</span>
        </button>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {allLinks.length > 1 && (
            <div className="flex items-center bg-[#131620] border border-white/10 rounded-lg p-0.5 shadow-sm">
              <div className="relative flex items-center">
                <Search className="w-3 h-3 text-zinc-500 absolute left-2 pointer-events-none" />
                <input
                  type="text"
                  value={linkFilterQuery}
                  onChange={(e) => setLinkFilterQuery(e.target.value)}
                  placeholder="Filtrar por nombre..."
                  aria-label="Filtrar enlaces por nombre"
                  className="bg-transparent text-[11px] text-zinc-300 pl-6 pr-5 py-0.5 w-24 sm:w-36 focus:outline-none focus:text-white placeholder-zinc-500"
                />
                {linkFilterQuery && (
                  <button
                    type="button"
                    onClick={() => setLinkFilterQuery('')}
                    className="absolute right-1 text-zinc-500 hover:text-white p-0.5"
                    title="Limpiar filtro"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              <select
                value={currentLink?.id || ''}
                onChange={handleSelectLink}
                aria-label="Seleccionar enlace analizado"
                className="bg-[#0B0D13] border-l border-white/10 text-[11px] text-zinc-300 px-2 py-0.5 focus:outline-none focus:border-indigo-500 rounded-r cursor-pointer max-w-[130px] sm:max-w-[180px] truncate"
              >
                {filteredSelectorLinks.length === 0 ? (
                  <option value="" disabled>
                    Sin coincidencias
                  </option>
                ) : (
                  filteredSelectorLinks.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name || l.shortCode}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <div
            className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
              currentLink?.isActive
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-zinc-400 bg-zinc-800/50 border-zinc-700'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                currentLink?.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
              }`}
            />
            <span>{currentLink?.isActive ? 'En Vivo' : 'Pausado'}</span>
          </div>
        </div>
      </div>

      {/* 2. Title & Short link pill */}
      <div className="space-y-1.5 px-1">
        <h2 className="text-lg font-black text-white tracking-tight">{displayName}</h2>
        {displaySlug && (
          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#131620] border border-white/5 text-xs text-zinc-400 hover:text-white transition-colors font-mono"
          >
            <span>{displaySlug}</span>
            <Copy className="w-3 h-3 text-zinc-500" />
          </button>
        )}
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
          <div className="text-2xl font-black text-white">{totalClicks.toLocaleString('en-US')}</div>
          <div className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
            <span>{totalClicks > 0 ? '● En tiempo real' : '○ Sin escaneos'}</span>
          </div>
        </div>

        {/* KPI 2: VISIT. ÚNICOS */}
        <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>VISIT. ÚNICOS</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{uniqueVisitors.toLocaleString('en-US')}</div>
          <div className="text-[10px] font-semibold text-emerald-400">
            {recurrenceRate} <span className="text-zinc-500 font-normal">tasa recurrencia</span>
          </div>
        </div>

        {/* KPI 3: DISP. LÍDER */}
        <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>DISP. LÍDER</span>
            <Smartphone className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-base font-bold text-white truncate">{topDevice}</div>
          <div className="text-[10px] text-zinc-400">{topOsPercent}% escaneos</div>
          <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${topOsPercent}%` }}
            />
          </div>
        </div>

        {/* KPI 4: CANAL PRINCIPAL */}
        <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>CANAL PRINCIPAL</span>
            <Compass className="w-4 h-4 text-amber-400" />
          </div>
          {topReferrer ? (
            <>
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="text-amber-400 truncate max-w-[90px]">{topReferrer.source || 'Directo/QR'}</span>
                <span>{Math.round(topReferrer.percentage)}%</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-400">
                <span className="truncate max-w-[90px]">{secondReferrer?.source || 'Otros'}</span>
                <span>{secondReferrer ? Math.round(secondReferrer.percentage) : 0}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-zinc-800 flex overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${Math.round(topReferrer.percentage)}%` }} />
                <div className="h-full bg-indigo-500" style={{ width: `${secondReferrer ? Math.round(secondReferrer.percentage) : 0}%` }} />
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold text-zinc-400">Sin registros</div>
              <div className="text-[10px] text-zinc-500">0% de actividad</div>
              <div className="w-full h-1.5 rounded-full bg-zinc-800" />
            </>
          )}
        </div>
      </div>

      {/* 5. Actividad Semanal Area Chart */}
      <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-sm font-bold text-white">Actividad en el Período</h4>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {totalClicks > 0
                ? `Pico máximo: ${peakPoint.clicks} escaneos (${peakPoint.date || 'reciente'})`
                : 'Sin actividad registrada en esta ventana de tiempo'}
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-semibold text-emerald-400 border border-white/5 flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${totalClicks > 0 ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            {avgDailyClicks} scans/día
          </span>
        </div>

        {/* Dynamic Curved Glowing Area Chart */}
        <div className="relative pt-6 pb-2">
          {peakPoint.clicks > 0 && (
            <div className="absolute top-0 right-12 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold shadow-glow-emerald/20 flex items-center gap-1">
              <span>Pico: {peakPoint.clicks} scans</span>
              <span className="text-emerald-400">↑</span>
            </div>
          )}

          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-28 overflow-visible">
            <defs>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818CF8" stopOpacity="0.4" />
                <stop offset="90%" stopColor="#818CF8" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Area Fill */}
            {areaPathD && <path d={areaPathD} fill="url(#areaGradient)" />}

            {/* Glow Path Line */}
            <path
              d={linePathD}
              fill="none"
              stroke="#818CF8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Render dots for points with clicks */}
            {pathCoords
              .filter((p) => p.clicks > 0)
              .map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="4"
                  fill="#818CF8"
                  stroke="#0B0D13"
                  strokeWidth="2"
                />
              ))}
          </svg>

          {/* Timeline Dates on X Axis */}
          {timelinePoints.length > 0 ? (
            <div className="flex justify-between text-center text-[10px] text-zinc-500 font-medium pt-1 px-2">
              {timelinePoints.map((tp, idx) => {
                const datePart = tp.date.split('-').slice(1).join('/');
                return (
                  <span
                    key={idx}
                    className={tp.clicks > 0 ? 'text-zinc-300 font-bold' : 'text-zinc-600'}
                  >
                    {datePart || `D${idx + 1}`}
                  </span>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-[10px] text-zinc-600 pt-1">
              Sin datos temporales en este rango
            </div>
          )}
        </div>
      </div>

      {/* 6. DESGLOSE DE AUDIENCIA */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            DESGLOSE DE AUDIENCIA
          </span>
          <span className="text-[10px] text-zinc-500">Datos Reales</span>
        </div>

        {/* Card: Sistemas Operativos */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-purple-400" />
              <h5 className="text-xs font-bold text-white">Sistemas Operativos</h5>
            </div>
            <span className="text-[10px] text-zinc-500">
              {stats?.breakdowns?.os?.length ? `Top ${stats.breakdowns.os.length}` : 'Sin datos'}
            </span>
          </div>

          {stats?.breakdowns?.os && stats.breakdowns.os.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {stats.breakdowns.os.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-zinc-300 mb-1">
                    <span>{item.name || 'Desconocido'}</span>
                    <span className="font-bold text-white">{Math.round(item.percentage)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        idx === 0 ? 'bg-indigo-400' : idx === 1 ? 'bg-emerald-400' : 'bg-zinc-600'
                      }`}
                      style={{ width: `${Math.round(item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 py-1">No hay escaneos con datos de SO registrados.</p>
          )}
        </div>

        {/* Card: Navegadores */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-400" />
              <h5 className="text-xs font-bold text-white">Navegadores</h5>
            </div>
            <span className="text-[10px] text-zinc-500">Móvil & Web</span>
          </div>

          {stats?.breakdowns?.browsers && stats.breakdowns.browsers.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {stats.breakdowns.browsers.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-zinc-300 mb-1">
                    <span>{item.name || 'Desconocido'}</span>
                    <span className="font-bold text-amber-400">{Math.round(item.percentage)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-indigo-400' : 'bg-zinc-600'
                      }`}
                      style={{ width: `${Math.round(item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 py-1">No hay datos de navegadores registrados.</p>
          )}
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

          {stats?.breakdowns?.countries && stats.breakdowns.countries.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {stats.breakdowns.countries.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-zinc-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span>{getCountryEmoji(item.code)}</span>
                      <span>{item.name || item.code}</span>
                    </span>
                    <span className="font-bold text-emerald-400">{Math.round(item.percentage)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${Math.round(item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 py-1">No hay datos geográficos registrados.</p>
          )}
        </div>

        {/* Card: Puntos de Captura / Canales */}
        <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h5 className="text-xs font-bold text-white">Puntos de Captura</h5>
            </div>
            <span className="text-[10px] text-zinc-500">Fuentes & Referrers</span>
          </div>

          {stats?.breakdowns?.referrers && stats.breakdowns.referrers.length > 0 ? (
            <div className="space-y-2.5 text-xs">
              {stats.breakdowns.referrers.map((item, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-zinc-300 mb-1">
                    <span>{item.source || 'Directo / QR'}</span>
                    <span className="font-bold text-indigo-400">{Math.round(item.percentage)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${Math.round(item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500 py-1">Sin puntos de captura registrados todavía.</p>
          )}
        </div>
      </div>

      {/* 7. Hardware Activo Card */}
      <div className="p-3.5 rounded-2xl bg-[#131620] border border-white/5 flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl overflow-hidden bg-black/50 border border-white/10 shrink-0 flex items-center justify-center text-zinc-400">
          <Layers className="w-6 h-6 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="inline-flex items-center gap-1 text-[9px] font-bold text-zinc-400 bg-white/5 px-2 py-0.5 rounded-full uppercase">
            <span>{hardwareOrder ? 'HARDWARE VINCULADO' : 'HARDWARE NFC'}</span>
          </div>
          <h5 className="text-xs font-bold text-white truncate mt-0.5">
            {hardwareOrder
              ? hardwareOrder.items?.[0]?.itemType || (hardwareOrder.items?.[0] as any)?.productName || 'Hardware NFC Activo'
              : 'Sin hardware NFC registrado'}
          </h5>
          <p className="text-[10px] text-zinc-400">
            {hardwareOrder
              ? `Estado: ${hardwareOrder.paymentStatus.toUpperCase()} - ${hardwareOrder.fulfillmentStatus}`
              : 'Adquiere stands o tarjetas en la Tienda NFC para sincronizar lecturas físicas.'}
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
              <h4 className="text-sm font-bold text-white">Exportación & Conexión GA4</h4>
            </div>
          </div>

          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 uppercase">
            {isPro ? 'ACTIVO' : 'PLAN PRO'}
          </span>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Exporta informes completos en formato PDF / CSV y sincroniza automáticamente los eventos de escaneo físico directo con Google Analytics 4.
        </p>

        <div className="flex gap-2 pt-1">
          {!isPro ? (
            <button
              onClick={onOpenUpgradeModal}
              className="flex-1 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-glow-gold/20 flex items-center justify-center transition-all"
            >
              Activar Plan PRO
            </button>
          ) : (
            <button
              onClick={() => onShowToast('Exportando reporte a CSV...', 'success')}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center transition-all"
            >
              Exportar a CSV
            </button>
          )}
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
