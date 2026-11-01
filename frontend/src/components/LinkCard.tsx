import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { LinkItem, API_BASE_URL, api } from '../services/api';
import {
  Copy,
  Check,
  ExternalLink,
  PowerOff,
  Power,
  Trash2,
  Maximize2,
  Clock,
} from 'lucide-react';

interface LinkCardProps {
  link: LinkItem;
  onUpdate: (updated: LinkItem) => void;
  onDelete: (id: string) => void;
  onOpenModal: (link: LinkItem) => void;
}

export const LinkCard: React.FC<LinkCardProps> = ({
  link,
  onUpdate,
  onDelete,
  onOpenModal,
}) => {
  const [copied, setCopied] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const shortUrl = `${API_BASE_URL}/${link.shortCode}`;
  const fgColor = link.qrConfig?.foregroundColor || '#000000';
  const bgColor = link.qrConfig?.backgroundColor || '#FFFFFF';

  const handleCopy = () => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleActive = async () => {
    setLoadingAction(true);
    try {
      // Al actualizar isActive, el backend ejecuta invalidación reactiva: DEL r:{shortCode}
      const updated = await api.updateLink(link.id, {
        isActive: !link.isActive,
      });
      onUpdate(updated);
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || 'Error al actualizar enlace');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar enlace /${link.shortCode}? Se invalidará inmediatamente de Redis.`)) {
      return;
    }
    setLoadingAction(true);
    try {
      await api.deleteLink(link.id);
      onDelete(link.id);
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || 'Error al eliminar');
    } finally {
      setLoadingAction(false);
    }
  };

  const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-xl border bg-white p-5 transition-all sm:flex-row sm:items-center ${
        link.isActive
          ? 'border-slate-200/90 shadow-sm hover:border-slate-300'
          : 'border-slate-200 bg-slate-50/60 opacity-80'
      }`}
    >
      {/* Left side: QR preview + Link info */}
      <div className="flex items-start gap-4">
        {/* Compact QR Preview with click to open full preview */}
        <div
          onClick={() => onOpenModal(link)}
          className="relative cursor-pointer shrink-0 rounded-lg border border-slate-100 p-2 shadow-xs transition hover:scale-105"
          style={{ backgroundColor: bgColor }}
          title="Clic para ampliar código QR"
        >
          <QRCodeSVG
            value={shortUrl}
            size={76}
            level="H"
            fgColor={fgColor}
            bgColor={bgColor}
          />
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 opacity-0 transition group-hover:opacity-100">
            <Maximize2 className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold text-slate-900">
              /{link.shortCode}
            </span>

            {/* Status indicator badge */}
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                link.isActive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {link.isActive ? 'Activo (RAM)' : 'Inactivo (404)'}
            </span>
          </div>

          {/* Short URL with copy */}
          <div className="mt-1 flex items-center gap-2">
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
              title="Abrir endpoint de redirección rápida"
            >
              {shortUrl}
            </a>
          </div>

          {/* Target URL */}
          <p
            className="mt-1 truncate text-xs text-slate-500"
            title={link.targetUrl}
          >
            Destino: <span className="font-medium text-slate-700">{link.targetUrl}</span>
          </p>

          {/* Date info */}
          <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Right side: Action buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 sm:mt-0 sm:flex-nowrap sm:border-0 sm:pt-0">
        {/* Botón Copiar */}
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
          title="Copiar URL corta"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-600 font-semibold">Copiado</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-slate-500" />
              <span>Copiar</span>
            </>
          )}
        </button>

        {/* Botón Probar Redirección (abre en pestaña nueva) */}
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/60 focus:outline-none"
          title="Probar redirección HTTP 302 y cache Redis"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Probar</span>
        </a>

        {/* Botón Invalidar / Desactivar (reactivo DEL r:{shortCode}) */}
        <button
          onClick={handleToggleActive}
          disabled={loadingAction}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition focus:outline-none ${
            link.isActive
              ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
          title={
            link.isActive
              ? 'Desactivar enlace e invalidar caché (DEL r:{shortCode})'
              : 'Reactivar enlace y precargar en caché'
          }
        >
          {link.isActive ? (
            <>
              <PowerOff className="h-3.5 w-3.5" />
              <span>Invalidar</span>
            </>
          ) : (
            <>
              <Power className="h-3.5 w-3.5" />
              <span>Reactivar</span>
            </>
          )}
        </button>

        {/* Botón Eliminar */}
        <button
          onClick={handleDelete}
          disabled={loadingAction}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none"
          title="Eliminar enlace"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
