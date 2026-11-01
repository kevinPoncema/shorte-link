import React, { useEffect, useState } from 'react';
import { api, LinkItem } from '../services/api';
import { CreateLinkForm } from '../components/CreateLinkForm';
import { LinkCard } from '../components/LinkCard';
import { QrPreviewModal } from '../components/QrPreviewModal';
import { RefreshCw, Link as LinkIcon, AlertCircle } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLinkForQr, setSelectedLinkForQr] = useState<LinkItem | null>(null);

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

  useEffect(() => {
    fetchLinks();
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
      {/* Create Link Form */}
      <CreateLinkForm onLinkCreated={handleLinkCreated} />

      {/* Links List Section */}
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Tus Enlaces & Códigos QR
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {links.length}
            </span>
          </div>

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
                onUpdate={handleLinkUpdated}
                onDelete={handleLinkDeleted}
                onOpenModal={(item) => setSelectedLinkForQr(item)}
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
    </main>
  );
};
