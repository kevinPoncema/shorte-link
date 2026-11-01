import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { LinkItem, API_BASE_URL } from '../services/api';
import { X, Download, ExternalLink, Check, Copy } from 'lucide-react';

interface QrPreviewModalProps {
  link: LinkItem | null;
  onClose: () => void;
}

export const QrPreviewModal: React.FC<QrPreviewModalProps> = ({ link, onClose }) => {
  const [copied, setCopied] = React.useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (!link) return null;

  const redirectUrl = `${API_BASE_URL}/${link.shortCode}`;
  const fgColor = link.qrConfig?.foregroundColor || '#000000';
  const bgColor = link.qrConfig?.backgroundColor || '#FFFFFF';

  const handleCopy = () => {
    navigator.clipboard.writeText(redirectUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${link.shortCode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl transition-all">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="min-w-0 pr-3">
            <h3 className="text-sm font-bold text-slate-900 truncate">
              {link.name ? link.name : 'Código QR Dinámico'}
            </h3>
            <span className="text-[11px] font-mono text-indigo-600 block truncate">
              {redirectUrl}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="my-5 flex flex-col items-center justify-center">
          <div
            className="flex items-center justify-center rounded-2xl p-4 shadow-sm border border-slate-100"
            style={{ backgroundColor: bgColor }}
          >
            <QRCodeSVG
              ref={svgRef}
              value={redirectUrl}
              size={180}
              level="H"
              fgColor={fgColor}
              bgColor={bgColor}
              includeMargin={false}
            />
          </div>

          {/* Quick link display */}
          <div className="mt-4 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="truncate font-mono font-medium text-slate-700">
              {redirectUrl}
            </span>
            <button
              onClick={handleCopy}
              className="ml-2 flex shrink-0 items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            onClick={handleDownloadSvg}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Descargar SVG</span>
          </button>

          <a
            href={redirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 focus:outline-none"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Probar Redirección</span>
          </a>
        </div>
      </div>
    </div>
  );
};
