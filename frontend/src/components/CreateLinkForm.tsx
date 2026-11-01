import React, { useState } from 'react';
import { api, ApiError, LinkItem } from '../services/api';
import { Plus, Link2, AlertCircle, Sparkles, ChevronDown, ChevronUp, Tag } from 'lucide-react';

interface CreateLinkFormProps {
  onLinkCreated: (newLink: LinkItem) => void;
}

export const CreateLinkForm: React.FC<CreateLinkFormProps> = ({ onLinkCreated }) => {
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qrColor, setQrColor] = useState('#000000');
  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl.trim()) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const payload: {
        targetUrl: string;
        name?: string;
        qrConfig?: { foregroundColor?: string; backgroundColor?: string };
      } = {
        targetUrl: targetUrl.trim(),
      };

      if (name.trim()) {
        payload.name = name.trim();
      }

      if (qrColor !== '#000000' || qrBgColor !== '#FFFFFF') {
        payload.qrConfig = {
          foregroundColor: qrColor,
          backgroundColor: qrBgColor,
        };
      }

      // El shortCode se genera estrictamente en el backend
      const created = await api.createLink(payload);
      onLinkCreated(created);
      setName('');
      setTargetUrl('');
      setShowAdvanced(false);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      // Captura y muestra directamente el error (especialmente 403 Forbidden de cuota de plan)
      const message =
        apiErr.statusCode === 403
          ? `Límite de Plan: ${apiErr.message}`
          : apiErr.message || 'Error al crear el enlace';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">
          Crear Enlace Corto & QR Dinámico
        </h2>
        <p className="text-xs text-slate-500">
          El backend generará automáticamente el enlace acortado único para redirección en RAM.
        </p>
      </div>

      {errorMessage && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Nombre de referencia */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nombre de referencia (opcional)
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Tag className="h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="ej. Campaña Instagram, Menú Restaurante..."
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          {/* URL original de destino */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              URL de destino (a la que redirige) *
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Link2 className="h-4 w-4" />
              </div>
              <input
                type="url"
                required
                placeholder="https://tu-sitio-web.com/pagina-larga"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
        </div>

        {/* Botón de acción y Opciones de diseño */}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            <span>Personalizar colores del código QR</span>
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="submit"
            disabled={loading || !targetUrl.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span>Generar Enlace</span>
              </>
            )}
          </button>
        </div>

        {/* Desplegable de colores QR */}
        {showAdvanced && (
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-100 bg-slate-50/80 p-3.5 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Color QR
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="color"
                  value={qrColor}
                  onChange={(e) => setQrColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                />
                <span className="font-mono text-xs text-slate-600">{qrColor}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Color Fondo
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="color"
                  value={qrBgColor}
                  onChange={(e) => setQrBgColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                />
                <span className="font-mono text-xs text-slate-600">{qrBgColor}</span>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
