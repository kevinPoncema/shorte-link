import React, { useState } from 'react';
import { LinkItem, API_BASE_URL, api, ApiError } from '../services/api';
import { X, Save, AlertCircle, Sparkles, Link2, Tag, RefreshCw } from 'lucide-react';

interface EditLinkModalProps {
  link: LinkItem | null;
  onClose: () => void;
  onLinkUpdated: (updated: LinkItem) => void;
}

export const EditLinkModal: React.FC<EditLinkModalProps> = ({
  link,
  onClose,
  onLinkUpdated,
}) => {
  if (!link) return null;

  const [name, setName] = useState(link.name || '');
  const [targetUrl, setTargetUrl] = useState(link.targetUrl);
  const [isActive, setIsActive] = useState(link.isActive);
  const [qrColor, setQrColor] = useState(
    link.qrConfig?.foregroundColor || '#000000'
  );
  const [qrBgColor, setQrBgColor] = useState(
    link.qrConfig?.backgroundColor || '#FFFFFF'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shortUrl = `${API_BASE_URL}/${link.shortCode}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim()) return;

    setLoading(true);
    setError(null);

    try {
      let cleanTarget = targetUrl.trim();
      if (!/^https?:\/\//i.test(cleanTarget)) {
        cleanTarget = `https://${cleanTarget}`;
      }

      // Al actualizar targetUrl o parámetros, el backend ejecuta invalidación reactiva: DEL r:{shortCode}
      const updated = await api.updateLink(link.id, {
        name: name.trim(),
        targetUrl: cleanTarget,
        isActive,
        qrConfig: {
          ...link.qrConfig,
          foregroundColor: qrColor,
          backgroundColor: qrBgColor,
        },
      });

      onLinkUpdated(updated);
      onClose();
    } catch (err: unknown) {
      console.error('Error al actualizar enlace:', err);
      const apiErr = err as ApiError;
      setError(apiErr.message || 'Error al actualizar el enlace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Editar Enlace & Parámetros
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Enlace acortado: {shortUrl}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Nombre de referencia */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nombre de referencia
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Tag className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="ej. Campaña Redes Sociales"
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* URL a la que redirige */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              URL a la que redirige (Destino final) *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Link2 className="h-4 w-4" />
              </div>
              <input
                type="url"
                required
                placeholder="https://destino-nuevo.com"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-indigo-600 flex items-center gap-1 font-medium">
              <RefreshCw className="h-3 w-3" />
              Al modificar la URL, la caché en Redis se invalida de inmediato (DEL r:{link.shortCode}).
            </p>
          </div>

          {/* Estado activo/inactivo */}
          <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div>
              <span className="block text-xs font-semibold text-slate-800">
                Estado de Redirección
              </span>
              <span className="block text-[11px] text-slate-500">
                {isActive
                  ? 'Activo: resuelve en microsegundos y redirige (302)'
                  : 'Inactivo: responde 404 Not Found'}
              </span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-5 w-9 rounded-full bg-slate-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-600 peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
            </label>
          </div>

          {/* Colores QR */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <span>Colores del código QR</span>
            </label>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div>
                <span className="block text-xs text-slate-600 mb-1">Color QR</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={qrColor}
                    onChange={(e) => setQrColor(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                  />
                  <span className="font-mono text-xs text-slate-600">{qrColor}</span>
                </div>
              </div>

              <div>
                <span className="block text-xs text-slate-600 mb-1">Fondo QR</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={qrBgColor}
                    onChange={(e) => setQrBgColor(e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                  />
                  <span className="font-mono text-xs text-slate-600">{qrBgColor}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !targetUrl.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 focus:outline-none disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Guardar e Invalidar Caché</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
