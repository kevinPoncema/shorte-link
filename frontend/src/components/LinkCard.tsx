import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { LinkItem, API_BASE_URL, api, ApiError } from '../services/api';
import {
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Maximize2,
  Clock,
  Edit3,
  Tag,
  Link2,
  BarChart3,
} from 'lucide-react';

interface LinkCardProps {
  link: LinkItem;
  onEdit: (link: LinkItem) => void;
  onDelete: (id: string) => void;
  onOpenModal: (link: LinkItem) => void;
  onOpenStats: (link: LinkItem) => void;
}

export const LinkCard: React.FC<LinkCardProps> = ({
  link,
  onEdit,
  onDelete,
  onOpenModal,
  onOpenStats,
}) => {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const shortUrl = `${API_BASE_URL}/${link.shortCode}`;
  const fgColor = link.qrConfig?.foregroundColor || '#000000';
  const bgColor = link.qrConfig?.backgroundColor || '#FFFFFF';

  const handleCopy = () => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar el enlace "${link.name || shortUrl}"? Se borrará de la base de datos y se invalidará automáticamente de Redis.`)) {
      return;
    }
    setDeleting(true);
    try {
      await api.deleteLink(link.id);
      onDelete(link.id);
    } catch (err: unknown) {
      console.error('Error al eliminar enlace:', err);
      const apiErr = err as ApiError;
      alert(apiErr.message || 'Error al eliminar el enlace');
      setDeleting(false);
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
      className={`group relative flex flex-col justify-between rounded-xl border bg-white p-5 transition-all lg:flex-row lg:items-center ${
        link.isActive
          ? 'border-slate-200/90 shadow-sm hover:border-slate-300'
          : 'border-slate-200 bg-slate-50/60 opacity-75'
      }`}
    >
      {/* Lado izquierdo: QR + Enlace acortado + Destino original + Nombre */}
      <div className="flex items-start gap-4">
        {/* Previsualización QR clicable para ampliar */}
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

        {/* Información del enlace (solo link acortado, nombre y original) */}
        <div className="min-w-0 flex-1">
          {/* Nombre de referencia o etiqueta */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900 text-sm">
              <Tag className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
              <span className="truncate">
                {link.name ? link.name : 'Enlace sin nombre de referencia'}
              </span>
            </div>

            {/* Estado activo/inactivo */}
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

          {/* Enlace acortado completo */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400">Corto:</span>
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
              title="Abrir enlace acortado"
            >
              {shortUrl}
            </a>
          </div>

          {/* Enlace original al que redirige */}
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 shrink-0 flex items-center gap-0.5">
              <Link2 className="h-3 w-3" />
              Destino:
            </span>
            <p
              className="truncate text-xs text-slate-700 font-medium"
              title={link.targetUrl}
            >
              {link.targetUrl}
            </p>
          </div>

          {/* Fecha de creación */}
          <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" />
            <span>Creado el {formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Lado derecho: Acciones */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 lg:mt-0 lg:flex-nowrap lg:border-0 lg:pt-0">
        {/* Botón Copiar */}
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
          title="Copiar enlace acortado"
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

        {/* Botón Probar Redirección */}
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 focus:outline-none"
          title="Probar redirección rápida y caché"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Probar</span>
        </a>

        {/* Botón Estadísticas / Métricas */}
        <button
          onClick={() => onOpenStats(link)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
          title="Ver estadísticas en tiempo real, KPIs y desgloses"
        >
          <BarChart3 className="h-3.5 w-3.5 text-indigo-600" />
          <span>Métricas</span>
        </button>

        {/* Botón Editar parámetros / destino */}
        <button
          onClick={() => onEdit(link)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
          title="Editar nombre, URL de destino o colores (invalida en Redis automáticamente)"
        >
          <Edit3 className="h-3.5 w-3.5 text-slate-600" />
          <span>Editar</span>
        </button>

        {/* Botón Eliminar */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none"
          title="Eliminar enlace"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
