import React, { useEffect, useState } from 'react';
import { api, LinkItem, User } from '../services/api';
import { CreateLinkForm } from '../components/CreateLinkForm';
import { LinkCard } from '../components/LinkCard';
import { QrPreviewModal } from '../components/QrPreviewModal';
import { EditLinkModal } from '../components/EditLinkModal';
import { LinkStatsModal } from '../components/LinkStatsModal';
import { PhysicalOrderModal } from '../components/PhysicalOrderModal';
import {
  RefreshCw,
  Link as LinkIcon,
  AlertCircle,
  Sparkles,
  CreditCard,
} from 'lucide-react';

interface DashboardPageProps {
  currentUser?: User | null;
  onOpenPlans?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  currentUser: propUser,
  onOpenPlans,
}) => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const currentUser = propUser !== undefined ? propUser : api.getCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [physicalOrdersEnabled, setPhysicalOrdersEnabled] = useState<boolean>(true);
  const [togglingPhysicalFlag, setTogglingPhysicalFlag] = useState<boolean>(false);
  const [selectedLinkForQr, setSelectedLinkForQr] = useState<LinkItem | null>(null);
  const [selectedLinkForEdit, setSelectedLinkForEdit] = useState<LinkItem | null>(null);
  const [selectedLinkForStats, setSelectedLinkForStats] = useState<LinkItem | null>(null);
  const [selectedLinkForPhysical, setSelectedLinkForPhysical] = useState<LinkItem | null>(null);

  const fetchLinks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLinks();
      setLinks(data);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message || 'Error al cargar los enlaces');
    } finally {
      setLoading(false);
    }
  };

  const fetchBillingConfig = async () => {
    try {
      const cfg = await api.getBillingConfig();
      setPhysicalOrdersEnabled(cfg.physicalOrdersEnabled);
    } catch {
      // Mantiene el valor por defecto true si no responde
    }
  };

  const handleTogglePhysicalOrders = async () => {
    setTogglingPhysicalFlag(true);
    try {
      const next = !physicalOrdersEnabled;
      const res = await api.togglePhysicalOrders(next);
      setPhysicalOrdersEnabled(res.physicalOrdersEnabled);
    } catch (err: unknown) {
      setError(
        (err as { message?: string })?.message ||
          'No se pudo actualizar el flag booleano de pedidos físicos',
      );
    } finally {
      setTogglingPhysicalFlag(false);
    }
  };

  useEffect(() => {
    void fetchLinks();
    void fetchBillingConfig();
  }, []);

  const handleLinkCreated = (newLink: LinkItem) => {
    setLinks((prev) => [newLink, ...prev]);
  };

  const handleLinkUpdated = (updatedLink: LinkItem) => {
    setLinks((prev) =>
      prev.map((item) => (item.id === updatedLink.id ? updatedLink : item))
    );
  };

  const handleLinkDeleted = (id: string) => {
    setLinks((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Plan Starter Upgrade Banner */}
      {currentUser && (currentUser.plan || 'STARTER').toUpperCase() !== 'PRO' && (
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/40 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Plan Starter Activo (Límite: 3 enlaces activos)
              </p>
              <p className="text-[11px] text-slate-500">
                Obtén hasta 50 enlaces activos, personalización de colores de QR y 365 días de analíticas con el Plan PRO.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenPlans}
            data-testid="dashboard-upgrade-btn"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ver Planes & Mejorar</span>
          </button>
        </div>
      )}

      {/* Create Link Form */}
      <CreateLinkForm onLinkCreated={handleLinkCreated} />

      {/* Links List Section */}
      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Tus Enlaces & Códigos QR
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {links.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Feature Flag Booleano: Pedidos Físicos NFC */}
            <button
              type="button"
              onClick={handleTogglePhysicalOrders}
              disabled={togglingPhysicalFlag}
              data-testid="toggle-physical-orders-btn"
              title="Conmutar flag booleano del módulo de pedidos físicos (ENABLE_PHYSICAL_ORDERS)"
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                physicalOrdersEnabled
                  ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                  : 'border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              <span>
                Pedidos Físicos NFC: {physicalOrdersEnabled ? 'Activo' : 'Inactivo'}
              </span>
            </button>

            <button
              onClick={fetchLinks}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 focus:outline-none"
              title="Recargar enlaces"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refrescar</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {loading && links.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-6 text-slate-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="mt-2 text-xs">Cargando enlaces desde PostgreSQL...</p>
          </div>
        ) : links.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <LinkIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-800">
              Aún no tienes enlaces creados
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Genera tu primer enlace corto arriba para precalentarlo en Redis y descargar su QR dinámico.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((link) => (
              <LinkCard
                key={link.id}
                link={link}
                onEdit={(item) => setSelectedLinkForEdit(item)}
                onDelete={handleLinkDeleted}
                onOpenModal={(item) => setSelectedLinkForQr(item)}
                onOpenStats={(item) => setSelectedLinkForStats(item)}
                onOrderPhysical={
                  physicalOrdersEnabled
                    ? (item) => setSelectedLinkForPhysical(item)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal QR preview */}
      <QrPreviewModal
        link={selectedLinkForQr}
        onClose={() => setSelectedLinkForQr(null)}
      />

      {/* Modal para editar enlace y parámetros (invalida en Redis) */}
      <EditLinkModal
        link={selectedLinkForEdit}
        onClose={() => setSelectedLinkForEdit(null)}
        onLinkUpdated={handleLinkUpdated}
      />

      {/* Modal para estadísticas y analíticas de tráfico */}
      <LinkStatsModal
        link={selectedLinkForStats}
        currentUser={currentUser}
        onClose={() => setSelectedLinkForStats(null)}
      />

      {/* Modal para emitir y solicitar orden de hardware físico (Placa/Tarjeta con NFC y QR) */}
      <PhysicalOrderModal
        isOpen={Boolean(selectedLinkForPhysical)}
        link={selectedLinkForPhysical}
        onClose={() => setSelectedLinkForPhysical(null)}
      />
    </main>
  );
};
