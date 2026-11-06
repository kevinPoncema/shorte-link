import React, { useState, useEffect } from 'react';
import {
  User,
  LinkItem,
  api,
  API_BASE_URL,
} from '../services/api';
import {
  Target,
  Zap,
  Search,
  Link2,
  Copy,
  Check,
  BarChart3,
  MoreVertical,
  Pencil,
  QrCode,
  Tag,
  Radio,
  Lock,
  Utensils,
  Wifi,
  Trash2,
} from 'lucide-react';

interface LinksDashboardViewProps {
  currentUser: User | null;
  onNavigateToEditor: (linkToEdit?: LinkItem) => void;
  onNavigateToAnalytics: (linkId: string) => void;
  onOpenUpgradeModal: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onPreviewQr: (link: LinkItem) => void;
  onOrderPhysical: (link: LinkItem) => void;
}

export const LinksDashboardView: React.FC<LinksDashboardViewProps> = ({
  currentUser,
  onNavigateToEditor,
  onNavigateToAnalytics,
  onOpenUpgradeModal,
  onShowToast,
  onPreviewQr,
  onOrderPhysical,
}) => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [tempTargetUrl, setTempTargetUrl] = useState('');

  const isPro = (currentUser?.plan || 'STARTER').toUpperCase() === 'PRO';
  const maxLinks = isPro ? 50 : 3;
  const activeCount = links.filter((l) => l.isActive).length;
  const quotaUsedPercent = Math.min(100, Math.round((activeCount / maxLinks) * 100));
  const remainingLinks = Math.max(0, maxLinks - activeCount);

  useEffect(() => {
    loadLinks();
  }, []);

  const loadLinks = async () => {
    try {
      const data = await api.getLinks();
      setLinks(data);
    } catch {
      onShowToast('No se pudieron cargar los enlaces', 'error');
    }
  };

  const handleToggleActive = async (link: LinkItem) => {
    const nextState = !link.isActive;
    try {
      const updated = await api.updateLink(link.id, { isActive: nextState });
      setLinks((prev) => prev.map((l) => (l.id === link.id ? updated : l)));
      onShowToast(
        nextState ? `Enlace "${link.name || link.shortCode}" activado en RAM` : `Enlace "${link.name || link.shortCode}" pausado (404)`,
        'success',
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Error al actualizar estado', 'error');
    }
  };

  const handleCopyLink = (shortCode: string) => {
    const fullUrl = `${API_BASE_URL}/${shortCode}`;
    const displayUrl = `kineti.qr/r/${shortCode}`;
    navigator.clipboard.writeText(fullUrl);
    onShowToast(`Copiado ${displayUrl} al portapapeles`, 'success');
  };

  const handleStartEditUrl = (link: LinkItem) => {
    setEditingUrlId(link.id);
    setTempTargetUrl(link.targetUrl);
  };

  const handleSaveUrl = async (linkId: string) => {
    if (!tempTargetUrl.trim()) return;
    try {
      let clean = tempTargetUrl.trim();
      if (!/^https?:\/\//i.test(clean)) {
        clean = `https://${clean}`;
      }
      const updated = await api.updateLink(linkId, { targetUrl: clean });
      setLinks((prev) => prev.map((l) => (l.id === linkId ? updated : l)));
      setEditingUrlId(null);
      onShowToast('URL de destino actualizada e invalidada en Redis', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Error al actualizar URL', 'error');
    }
  };

  const handleDelete = async (link: LinkItem) => {
    if (!window.confirm(`¿Eliminar enlace "${link.name || link.shortCode}"? Se purgará de la base de datos y Redis.`)) return;
    try {
      await api.deleteLink(link.id);
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      onShowToast('Enlace eliminado permanentemente', 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'Error al eliminar', 'error');
    }
  };

  const filteredLinks = links.filter((link) => {
    const matchesSearch =
      (link.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.shortCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.targetUrl.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'active') return matchesSearch && link.isActive;
    if (statusFilter === 'inactive') return matchesSearch && !link.isActive;
    return matchesSearch;
  });

  return (
    <div className="space-y-4 pb-20">
      {/* 1. Quota Banner */}
      <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                {activeCount} de {maxLinks} enlaces activos
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
                  {isPro ? 'PRO' : 'STARTER'}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {isPro ? 'Capacidad ampliada' : `Queda ${remainingLinks} enlace disponible antes del límite.`}
                </span>
              </div>
            </div>
          </div>

          {!isPro && (
            <button
              onClick={onOpenUpgradeModal}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-all shadow-glow-gold/20 flex items-center gap-1 shrink-0"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Desbloquear 50</span>
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            style={{ width: `${quotaUsedPercent}%` }}
            className={`h-full rounded-full transition-all duration-500 ${
              isPro ? 'bg-indigo-500' : 'bg-gradient-to-r from-amber-500 to-amber-400'
            }`}
          />
        </div>
      </div>

      {/* 2. Mini-KPIs Grid (Dinámico sin datos quemados) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-2xl bg-[#131620] border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>ENLACES ACT.</span>
            <QrCode className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div className="text-lg font-black text-white">{activeCount}</div>
          <div className="text-[10px] font-semibold text-emerald-400 flex items-center gap-0.5">
            <span>En línea</span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-[#131620] border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>CUOTA USO</span>
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg font-black text-white">{quotaUsedPercent}%</div>
          <div className="text-[10px] text-zinc-400">Capacidad</div>
        </div>

        <div className="p-3 rounded-2xl bg-[#131620] border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-zinc-400 text-[10px] font-bold tracking-wider">
            <span>DISPONIBLE</span>
            <Tag className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg font-black text-white">{remainingLinks}</div>
          <div className="text-[10px] font-semibold text-amber-400">Cupos libres</div>
        </div>
      </div>

      {/* 3. Search and Filter Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar enlaces o tags..."
            className="w-full bg-[#131620] border border-white/5 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="bg-[#131620] border border-white/5 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none cursor-pointer"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* 4. Primary Button: + Crear enlace nuevo */}
      <button
        onClick={() => onNavigateToEditor()}
        className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-between shadow-lg shadow-indigo-600/25 transition-all group"
      >
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 transition-transform group-hover:rotate-45" />
          <span className="font-bold tracking-wide">+ Crear enlace nuevo</span>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-indigo-400/20 text-indigo-200 text-[10px] font-semibold">
          {isPro ? 'Pro: Ilimitado' : `Starter: ${remainingLinks} libre`}
        </span>
      </button>

      {/* 5. Section Header */}
      <div className="flex items-center justify-between text-xs pt-1">
        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
          ENLACES CONFIGURADOS ({filteredLinks.length})
        </span>
        <span className="text-[10px] font-mono text-zinc-500">
          Auto-sync ON
        </span>
      </div>

      {/* 6. Link Cards List */}
      <div className="space-y-3">
        {filteredLinks.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#131620] border border-white/5 text-center space-y-2">
            <Link2 className="w-8 h-8 text-zinc-500 mx-auto" />
            <h4 className="text-sm font-bold text-white">No hay enlaces configurados</h4>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              Presiona el botón "+ Crear enlace nuevo" para registrar tu primer código QR dinámico.
            </p>
          </div>
        ) : (
          filteredLinks.map((link, index) => {
          const isMenu = index % 2 === 0;
          const displaySlug = `kineti.qr/r/${link.shortCode}`;
          const isMenuOpen = menuOpenId === link.id;

          return (
            <div
              key={link.id}
              className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-3 transition-all hover:border-white/10"
            >
              {/* Card Top: Icon + Title + Switch */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isMenu ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {isMenu ? <Utensils className="w-5 h-5" /> : <Wifi className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight">
                      {link.name || `Enlace #${link.shortCode}`}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px]">
                      <span className="flex items-center gap-1 text-emerald-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {link.isActive ? 'Activo' : 'Pausado'}
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-zinc-400">
                        {new Date(link.createdAt).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Switch Toggle */}
                <button
                  type="button"
                  onClick={() => handleToggleActive(link)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    link.isActive ? 'bg-emerald-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      link.isActive ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Short Link Pill with Copy */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#0B0D13] border border-white/5 text-xs">
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="font-mono text-zinc-300 truncate">
                    {displaySlug}
                  </span>
                </div>
                <button
                  onClick={() => handleCopyLink(link.shortCode)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-zinc-300 hover:text-white flex items-center gap-1 transition-colors shrink-0"
                >
                  <Copy className="w-3 h-3 text-zinc-400" />
                  <span>Copiar</span>
                </button>
              </div>

              {/* Destination URL row (with inline editing) */}
              <div className="text-xs">
                {editingUrlId === link.id ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="url"
                      value={tempTargetUrl}
                      onChange={(e) => setTempTargetUrl(e.target.value)}
                      className="flex-1 bg-[#0B0D13] border border-indigo-500/50 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none"
                    />
                    <button
                      onClick={() => handleSaveUrl(link.id)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold text-[11px]"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditingUrlId(null)}
                      className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 text-[11px]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-zinc-400 group">
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      <span className="text-zinc-600 font-bold">→</span>
                      <a
                        href={link.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-zinc-300 hover:text-indigo-400 transition-colors"
                      >
                        {link.targetUrl}
                      </a>
                    </div>
                    <button
                      onClick={() => handleStartEditUrl(link)}
                      title="Editar URL de destino"
                      className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Tags & Action Buttons (Dinámico sin datos quemados) */}
              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    link.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {link.isActive ? 'Activo en RAM' : 'Pausado'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/5 text-zinc-300 font-mono text-[10px] flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5 text-zinc-400" />
                    <span>/{link.shortCode}</span>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 relative">
                  <button
                    onClick={() => onNavigateToAnalytics(link.id)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-semibold flex items-center gap-1 transition-colors"
                  >
                    <BarChart3 className="w-3 h-3 text-indigo-400" />
                    <span>Analíticas</span>
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(isMenuOpen ? null : link.id)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 bottom-full mb-1 w-44 rounded-xl bg-[#1A1E2D] border border-white/10 shadow-2xl p-1 z-50 text-xs">
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            onPreviewQr(link);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/5 hover:text-white"
                        >
                          <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Ver Código QR</span>
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            onNavigateToEditor(link);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/5 hover:text-white"
                        >
                          <Pencil className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Editar en Studio</span>
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            onOrderPhysical(link);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/5 hover:text-white"
                        >
                          <Tag className="w-3.5 h-3.5 text-amber-400" />
                          <span>Pedir Soporte NFC</span>
                        </button>
                        <div className="my-1 border-t border-white/5" />
                        <button
                          onClick={() => {
                            setMenuOpenId(null);
                            handleDelete(link);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
      </div>

      {/* 7. Paywall Card: Límite Starter alcanzado */}
      {!isPro && (
        <div className="p-4 rounded-2xl bg-gradient-to-br from-[#1C1726] to-[#131620] border border-amber-500/25 space-y-3 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">
                  Límite Starter alcanzado
                </h4>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 uppercase">
                  PRO
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Has utilizado {activeCount} de 3 enlaces. El Plan Starter incluye hasta 3 enlaces dinámicos con analytics básicos. Actualiza a Pro para enlaces ilimitados, tu propio dominio y tags NFC reescribibles.
              </p>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Sin interrupción de servicio</span>
            </div>

            <button
              onClick={onOpenUpgradeModal}
              className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-glow-gold/20 flex items-center gap-1.5 transition-all"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Subir a PRO ($19/mes)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
