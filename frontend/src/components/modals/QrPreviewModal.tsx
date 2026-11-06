import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { LinkItem, API_BASE_URL } from '../../services/api';
import { X, Download, ExternalLink, Copy } from 'lucide-react';

interface QrPreviewModalProps {
  link: LinkItem | null;
  onClose: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const QrPreviewModal: React.FC<QrPreviewModalProps> = ({
  link,
  onClose,
  onShowToast,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  if (!link) return null;

  const shortUrl = `${API_BASE_URL}/${link.shortCode}`;
  const displayUrl = `kineti.qr/r/${link.shortCode}`;
  const fgColor = link.qrConfig?.foregroundColor || '#FFFFFF';
  const bgColor = link.qrConfig?.backgroundColor || '#0B0D13';

  const handleCopy = () => {
    navigator.clipboard.writeText(shortUrl);
    onShowToast(`Copiado ${displayUrl}`, 'success');
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
    onShowToast(`Descargado qr-${link.shortCode}.svg`, 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-[#131620] border border-white/10 shadow-2xl p-6 flex flex-col items-center">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-3 border-b border-white/5">
          <div className="min-w-0 pr-3">
            <h3 className="text-sm font-bold text-white truncate">
              {link.name || 'Código QR Dinámico'}
            </h3>
            <span className="text-[11px] font-mono text-indigo-400 block truncate">
              {displayUrl}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="my-5 p-4 rounded-2xl bg-[#0B0D13] border border-white/10 shadow-inner">
          <QRCodeSVG
            ref={svgRef}
            value={shortUrl}
            size={190}
            level="H"
            fgColor={fgColor}
            bgColor={bgColor}
          />
        </div>

        {/* Short link box */}
        <div className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#0B0D13] border border-white/5 text-xs text-zinc-300 font-mono mb-4">
          <span className="truncate pr-2">{displayUrl}</span>
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-indigo-400 font-semibold flex items-center gap-1 shrink-0"
          >
            <Copy className="w-3 h-3" />
            <span>Copiar</span>
          </button>
        </div>

        {/* Actions */}
        <div className="w-full grid grid-cols-2 gap-2">
          <button
            onClick={handleDownloadSvg}
            className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>SVG / 4K</span>
          </button>

          <a
            href={shortUrl}
            target="_blank"
            rel="noreferrer"
            className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Probar Enlace</span>
          </a>
        </div>
      </div>
    </div>
  );
};
