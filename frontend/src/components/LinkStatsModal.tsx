import React, { useEffect, useState } from 'react';
import {
  LinkItem,
  LinkStatsResponse,
  api,
  ApiError,
  API_BASE_URL,
  User,
} from '../services/api';
import {
  X,
  BarChart3,
  Users,
  Smartphone,
  Globe,
  RefreshCw,
  Calendar,
  AlertCircle,
  ExternalLink,
  Tag,
  Share2,
  Compass,
  Sparkles,
  Info,
} from 'lucide-react';

interface LinkStatsModalProps {
  link: LinkItem | null;
  currentUser: User | null;
  onClose: () => void;
}

const PERIOD_OPTIONS = [
  { id: '7d', label: '7 días', minPlan: 'STARTER' },
  { id: '30d', label: '30 días', minPlan: 'PRO' },
  { id: '90d', label: '90 días', minPlan: 'PRO' },
  { id: '365d', label: '1 año', minPlan: 'PRO' },
];

export const LinkStatsModal: React.FC<LinkStatsModalProps> = ({
  link,
  currentUser,
  onClose,
}) => {
  if (!link) return null;

  const [period, setPeriod] = useState<string>('7d');
  const [stats, setStats] = useState<LinkStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStarter = (currentUser?.plan || 'STARTER').toUpperCase() === 'STARTER';
  const shortUrl = `${API_BASE_URL}/${link.shortCode}`;

  const fetchStats = async (selectedPeriod: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLinkStats(link.id, selectedPeriod);
      setStats(data);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Error al obtener las estadísticas del enlace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(period);
  }, [link.id, period]);

  // Cálculo de escala para el gráfico de barras Timeline
  const timelinePoints = stats?.timeline || [];
  const maxClicks = Math.max(...timelinePoints.map((p) => p.clicks), 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="relative w-full max-w-4xl my-8 rounded-2xl bg-white p-6 shadow-2xl transition-all max-h-[90vh] flex flex-col">
        {/* Header Superior */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <BarChart3 className="h-4 w-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Estadísticas & Analíticas en Tiempo Real
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1 font-semibold text-slate-700 truncate max-w-xs">
                <Tag className="h-3 w-3 text-indigo-500 shrink-0" />
                {link.name || link.shortCode}
              </span>
              <span>•</span>
              <a
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-indigo-600 hover:underline flex items-center gap-1"
              >
                {shortUrl}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchStats(period)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 p-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              title="Actualizar métricas"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              title="Cerrar ventana"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Barra de Filtro de Periodo & Alerta de Plan */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-700">Ventana de tiempo:</span>
            <div className="flex items-center rounded-lg bg-slate-100 p-0.5">
              {PERIOD_OPTIONS.map((opt) => {
                const isSelected = period === opt.id;
                const isLockedForStarter = isStarter && opt.minPlan === 'PRO';

                return (
                  <button
                    key={opt.id}
                    onClick={() => setPeriod(opt.id)}
                    className={`relative rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-white text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title={
                      isLockedForStarter
                        ? 'En Plan Starter las métricas se acotan automáticamente a 7 días. Requiere Plan Pro para 30d/90d/365d.'
                        : undefined
                    }
                  >
                    {opt.label}
                    {isLockedForStarter && (
                      <span className="ml-1 text-[10px] text-amber-500 font-bold">★</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {isStarter && (
            <div className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/60 rounded-md px-2 py-0.5">
              <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
              <span>
                Plan Starter: Retención máxima de <strong>7 días</strong>.
              </span>
            </div>
          )}
        </div>

        {/* Contenido Principal con Scroll */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1 space-y-6">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {loading && !stats ? (
            <div className="flex h-64 flex-col items-center justify-center space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-600 border-t-transparent" />
              <p className="text-xs text-slate-500">
                Calculando agregaciones indexadas en PostgreSQL...
              </p>
            </div>
          ) : stats ? (
            <>
              {/* 1. Tarjetas KPI (Resumen Superior) */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {/* Total Escaneos / Clics */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-medium">Total Escaneos</span>
                    <BarChart3 className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                    {stats.summary.totalClicks.toLocaleString()}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">Volumen bruto de eventos</p>
                </div>

                {/* Visitantes Únicos */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-medium">Visitantes Únicos</span>
                    <Users className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                    {stats.summary.uniqueVisitors.toLocaleString()}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">IPs reales anonimizadas</p>
                </div>

                {/* Dispositivo Líder */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-medium">Dispositivo Líder</span>
                    <Smartphone className="h-4 w-4 text-violet-500" />
                  </div>
                  <div className="mt-2 text-xl font-bold tracking-tight text-slate-900 truncate">
                    {stats.summary.topDevice || 'Sin datos'}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">Público físico detectado</p>
                </div>

                {/* País Líder */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-medium">País Líder</span>
                    <Globe className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="mt-2 text-xl font-bold tracking-tight text-slate-900 truncate">
                    {stats.summary.topCountry || 'Sin datos'}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">Ubicación predominante</p>
                </div>
              </div>

              {/* 2. Línea de Tiempo (Gráfica Principal) */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Línea de Tiempo de Escaneos & Clics
                    </h4>
                    <p className="text-xs text-slate-500">
                      Evolución diaria de escaneos dentro del periodo de {stats.period}
                    </p>
                  </div>
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700">
                    {stats.timeline.reduce((acc, p) => acc + p.clicks, 0)} clics
                  </span>
                </div>

                {timelinePoints.length === 0 ? (
                  <div className="flex h-44 flex-col items-center justify-center text-center text-slate-400">
                    <Info className="h-8 w-8 mb-1 text-slate-300" />
                    <p className="text-xs">No se registraron clics en esta ventana de tiempo.</p>
                  </div>
                ) : (
                  <div className="mt-4">
                    {/* Gráfico de Barras Responsivo */}
                    <div className="flex h-44 items-end gap-1.5 sm:gap-3 border-b border-slate-100 pb-2">
                      {timelinePoints.map((point) => {
                        const heightPct = Math.max(
                          6,
                          Math.round((point.clicks / maxClicks) * 100)
                        );
                        return (
                          <div
                            key={point.date}
                            className="group relative flex flex-1 flex-col items-center h-full justify-end"
                          >
                            {/* Tooltip flotante */}
                            <div className="pointer-events-none absolute -top-10 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-md group-hover:block transition">
                              <span className="font-bold">{point.clicks} clics</span> ({point.date})
                            </div>

                            {/* Barra */}
                            <div
                              style={{ height: `${heightPct}%` }}
                              className="w-full max-w-[38px] rounded-t-md bg-linear-to-t from-indigo-600 to-indigo-400 transition-all group-hover:brightness-110 shadow-2xs"
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Eje X de Fechas */}
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>{timelinePoints[0]?.date}</span>
                      {timelinePoints.length > 2 && (
                        <span>
                          {timelinePoints[Math.floor(timelinePoints.length / 2)]?.date}
                        </span>
                      )}
                      <span>{timelinePoints[timelinePoints.length - 1]?.date}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Desgloses Porcentuales (Gráficas de Barras Horizontales) */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Desglose: Sistema Operativo */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-2 mb-3">
                    <Smartphone className="h-4 w-4 text-violet-500" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Sistemas Operativos (OS)
                    </h4>
                  </div>
                  {stats.breakdowns.os.length === 0 ? (
                    <p className="text-xs text-slate-400">Sin datos registrados</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.breakdowns.os.map((item) => (
                        <div key={item.name} className="text-xs">
                          <div className="flex justify-between font-medium text-slate-700 mb-1">
                            <span className="truncate">{item.name}</span>
                            <span className="font-semibold text-slate-900">
                              {item.percentage}% ({item.count})
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              style={{ width: `${item.percentage}%` }}
                              className="h-full rounded-full bg-linear-to-r from-violet-500 to-indigo-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Desglose: Navegadores */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-2 mb-3">
                    <Compass className="h-4 w-4 text-indigo-500" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Navegadores
                    </h4>
                  </div>
                  {stats.breakdowns.browsers.length === 0 ? (
                    <p className="text-xs text-slate-400">Sin datos registrados</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.breakdowns.browsers.map((item) => (
                        <div key={item.name} className="text-xs">
                          <div className="flex justify-between font-medium text-slate-700 mb-1">
                            <span className="truncate">{item.name}</span>
                            <span className="font-semibold text-slate-900">
                              {item.percentage}% ({item.count})
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              style={{ width: `${item.percentage}%` }}
                              className="h-full rounded-full bg-linear-to-r from-indigo-500 to-sky-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Desglose: Geolocalización (Países) */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center gap-2 mb-3">
                    <Globe className="h-4 w-4 text-sky-500" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Geolocalización (País)
                    </h4>
                  </div>
                  {stats.breakdowns.countries.length === 0 ? (
                    <p className="text-xs text-slate-400">Sin datos registrados</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.breakdowns.countries.map((item) => (
                        <div key={item.code} className="text-xs">
                          <div className="flex justify-between font-medium text-slate-700 mb-1">
                            <span className="truncate flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-slate-400 font-bold">
                                {item.code}
                              </span>
                              {item.name}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {item.percentage}% ({item.count})
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              style={{ width: `${item.percentage}%` }}
                              className="h-full rounded-full bg-linear-to-r from-sky-500 to-emerald-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Desglose: Fuentes de Tráfico (Referer) */}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Share2 className="h-4 w-4 text-emerald-500" />
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Fuentes de Tráfico
                      </h4>
                    </div>
                    <span className="text-[10px] text-slate-400" title="Direct / QR Scan indica escaneo con cámara nativa">
                      Cámara / Apps
                    </span>
                  </div>
                  {stats.breakdowns.referrers.length === 0 ? (
                    <p className="text-xs text-slate-400">Sin datos registrados</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.breakdowns.referrers.map((item) => (
                        <div key={item.source} className="text-xs">
                          <div className="flex justify-between font-medium text-slate-700 mb-1">
                            <span className="truncate flex items-center gap-1">
                              {item.source === 'Direct / QR Scan' ? (
                                <span className="text-emerald-700 font-semibold">
                                  {item.source} (Escaneo QR)
                                </span>
                              ) : (
                                item.source
                              )}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {item.percentage}% ({item.count})
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              style={{ width: `${item.percentage}%` }}
                              className="h-full rounded-full bg-linear-to-r from-emerald-500 to-teal-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
