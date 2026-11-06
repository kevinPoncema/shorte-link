import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  LinkItem,
  api,
  API_BASE_URL,
  User,
} from '../services/api';
import {
  Smartphone,
  Download,
  ExternalLink,
  ShieldCheck,
  Check,
  Palette,
  Lock,
  Layers,
  Save,
  Radio,
  Image as ImageIcon,
  UtensilsCrossed,
  Link2,
  Tag,
  RefreshCw,
} from 'lucide-react';

interface QrEditorViewProps {
  currentUser: User | null;
  linkToEdit?: LinkItem | null;
  onSaved: (link: LinkItem) => void;
  onAssignToNfc: (link: LinkItem) => void;
  onOpenUpgradeModal: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const COLOR_PALETTES = [
  { id: 'obsidian', name: 'Obsidian', fg: '#FFFFFF', bg: '#0B0D13', circleColor: '#2D3748' },
  { id: 'indigo', name: 'Indigo', fg: '#818CF8', bg: '#0B0D13', circleColor: '#6366F1' },
  { id: 'emerald', name: 'Emerald', fg: '#34D399', bg: '#0B0D13', circleColor: '#10B981' },
  { id: 'gold', name: 'Gold', fg: '#FBBF24', bg: '#0B0D13', circleColor: '#F59E0B' },
];

export const QrEditorView: React.FC<QrEditorViewProps> = ({
  currentUser,
  linkToEdit,
  onSaved,
  onOpenUpgradeModal,
  onShowToast,
}) => {
  const [name, setName] = useState(linkToEdit?.name || '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState(linkToEdit?.targetUrl || '');
  const [slug, setSlug] = useState(linkToEdit?.shortCode || '');
  const [selectedPalette, setSelectedPalette] = useState('obsidian');
  const [showCenterLogo, setShowCenterLogo] = useState(true);
  const [saving, setSaving] = useState(false);

  const isPro = (currentUser?.plan || 'STARTER').toUpperCase() === 'PRO';
  const qrRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (linkToEdit) {
      setName(linkToEdit.name || '');
      setTargetUrl(linkToEdit.targetUrl);
      setSlug(linkToEdit.shortCode);
    }
  }, [linkToEdit]);

  const activePalette = COLOR_PALETTES.find((p) => p.id === selectedPalette) || COLOR_PALETTES[0];
  const shortUrl = slug.trim()
    ? `${API_BASE_URL}/${slug.trim()}`
    : targetUrl.trim()
      ? targetUrl.trim()
      : `${API_BASE_URL}/preview`;
  const displaySlugUrl = slug.trim() ? `kineti.qr/r/${slug.trim()}` : 'kineti.qr/r/...';

  const isValidUrl = /^https?:\/\//i.test(targetUrl.trim());

  const handleTestScan = () => {
    if (!targetUrl.trim()) {
      onShowToast('Ingresa una URL de destino antes de probar el escaneo', 'info');
      return;
    }
    window.open(shortUrl, '_blank');
    onShowToast('Abriendo redirección rápida en nueva pestaña', 'info');
  };

  const handleDownloadSvg = () => {
    if (!qrRef.current) return;
    const svgData = new XMLSerializer().serializeToString(qrRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${slug || 'dinamico'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast(`Archivo vectorial qr-${slug || 'dinamico'}.svg descargado`, 'success');
  };

  const handleSaveDynamic = async () => {
    if (!name.trim()) {
      setNameError('El Nombre de Referencia es obligatorio');
      onShowToast('El Nombre de Referencia es obligatorio', 'error');
      return;
    }
    setNameError(null);

    if (!targetUrl.trim()) {
      onShowToast('Por favor ingresa una URL de destino', 'error');
      return;
    }

    setSaving(true);
    try {
      let cleanTarget = targetUrl.trim();
      if (!/^https?:\/\//i.test(cleanTarget)) {
        cleanTarget = `https://${cleanTarget}`;
      }

      // Solo adjuntar personalización de color QR si el usuario posee plan PRO (contrato PlanStrategy)
      const qrConfig = isPro
        ? {
            foregroundColor: activePalette.fg,
            backgroundColor: activePalette.bg,
          }
        : undefined;

      // Normalizar slug para validación OpenAPI: ^[A-Za-z0-9]{6,16}$
      const alphanumericSlug = slug.replace(/[^A-Za-z0-9]/g, '');
      const validShortCode =
        alphanumericSlug.length >= 6 && alphanumericSlug.length <= 16
          ? alphanumericSlug
          : undefined;

      let savedLink: LinkItem;

      if (linkToEdit) {
        savedLink = await api.updateLink(linkToEdit.id, {
          name: name.trim(),
          targetUrl: cleanTarget,
          ...(qrConfig ? { qrConfig } : {}),
        });
        onShowToast('Enlace dinámico actualizado en PostgreSQL y Redis', 'success');
      } else {
        savedLink = await api.createLink({
          name: name.trim(),
          targetUrl: cleanTarget,
          ...(validShortCode ? { shortCode: validShortCode } : {}),
          ...(qrConfig ? { qrConfig } : {}),
        });
        onShowToast('¡Enlace dinámico creado y precalentado en RAM!', 'success');
      }

      onSaved(savedLink);
    } catch (err: any) {
      onShowToast(err?.message || 'Error al guardar el enlace', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-28">
      {/* 1. Subheader: STUDIO / EDITOR ACTIVO */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-1.5 font-bold tracking-wider text-zinc-400 uppercase text-[11px]">
          <span className="text-indigo-400">❖</span>
          <span>STUDIO / EDITOR ACTIVO</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Enrutado Dinámico</span>
        </div>
      </div>

      {/* 2. QR Code Preview Card */}
      <div className="p-5 rounded-2xl bg-[#131620] border border-white/5 space-y-4 flex flex-col items-center shadow-xl">
        {/* Top Badges */}
        <div className="w-full flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 text-zinc-300 font-medium">
            <RefreshCw className="w-3 h-3 text-emerald-400 animate-spin-slow" />
            <span>Actualización en tiempo real</span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-white/5 text-zinc-500 font-mono text-[10px]">
            v3.42
          </span>
        </div>

        {/* QR Canvas Box with Center Icon */}
        <div className="p-6 rounded-3xl bg-[#0B0D13] border border-white/10 shadow-2xl relative flex items-center justify-center my-1 group">
          <div className="p-3 bg-[#0B0D13] rounded-2xl">
            <QRCodeSVG
              ref={qrRef}
              value={shortUrl}
              size={180}
              level="H"
              fgColor={activePalette.fg}
              bgColor={activePalette.bg}
              includeMargin={false}
            />
          </div>

          {/* Central Logo Overlay */}
          {showCenterLogo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 p-[2px] shadow-lg flex items-center justify-center">
                <div className="h-full w-full bg-[#0B0D13] rounded-[10px] flex items-center justify-center text-amber-400">
                  <UtensilsCrossed className="w-5 h-5" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Slug pill under QR */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0B0D13] border border-white/5 text-xs text-zinc-300 font-mono">
          <Link2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{displaySlugUrl}</span>
        </div>

        {/* Two Action Buttons: Probar Escaneo & SVG / 4K */}
        <div className="w-full grid grid-cols-2 gap-2.5 pt-1">
          <button
            onClick={handleTestScan}
            className="py-2.5 px-3 rounded-xl bg-[#1E2230] hover:bg-[#282E40] text-zinc-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-white/5"
          >
            <Smartphone className="w-3.5 h-3.5 text-zinc-400" />
            <span>Probar Escaneo</span>
          </button>

          <button
            onClick={handleDownloadSvg}
            className="py-2.5 px-3 rounded-xl bg-[#1E2230] hover:bg-[#282E40] text-amber-300 text-xs font-semibold flex items-center justify-center gap-2 transition-colors border border-amber-500/20 shadow-glow-gold/10"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>SVG / 4K</span>
          </button>
        </div>
      </div>

      {/* 3. PARÁMETROS DE REDIRECCIÓN */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs px-1">
          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
            PARÁMETROS DE REDIRECCIÓN
          </span>
          <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            SSL Activo
          </span>
        </div>

        {/* Field: Nombre de Referencia (Obligatorio) */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs px-1">
            <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
              <span>Nombre de Referencia</span>
              <span className="text-rose-400 font-bold">*</span>
            </label>
            <span className="text-[10px] text-rose-400/90 font-medium">Obligatorio</span>
          </div>
          <div className="relative">
            <Tag className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError(null);
              }}
              placeholder="Ej. Menú Principal, Wi-Fi Restaurante, Catálogo..."
              className={`w-full bg-[#131620] border rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors ${
                nameError
                  ? 'border-rose-500/80 focus:border-rose-500'
                  : 'border-white/5 focus:border-indigo-500'
              }`}
            />
          </div>
          {nameError && (
            <p className="text-[10px] text-rose-400 px-1 font-medium">{nameError}</p>
          )}
        </div>

        {/* Field: Destino Final (Target URL) */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs px-1">
            <label className="text-[11px] font-medium text-zinc-300 flex items-center gap-1">
              <span>Destino Final (Target URL)</span>
              <span className="text-rose-400 font-bold">*</span>
            </label>
            {isValidUrl && (
              <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Verificado y activo
              </span>
            )}
          </div>
          <div className="relative">
            <Link2 className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              required
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://ejemplo.com/tu-destino"
              className="w-full bg-[#131620] border border-white/5 rounded-xl pl-9 pr-9 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {targetUrl && (
              <a
                href={targetUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <p className="text-[11px] text-zinc-500 px-1 leading-relaxed">
            Puedes cambiar esta URL en cualquier momento sin reimprimir stickers o códigos físicos.
          </p>
        </div>

        {/* Field: Slug Corto Personalizado */}
        <div className="space-y-1">
          <label className="block text-[11px] font-medium text-zinc-300 px-1">
            Slug Corto Personalizado (Opcional)
          </label>
          <div className="flex items-center rounded-xl bg-[#131620] border border-white/5 overflow-hidden focus-within:border-indigo-500 transition-colors">
            <span className="px-3 py-2.5 bg-[#0B0D13] text-zinc-500 text-xs font-mono border-r border-white/5">
              kineti.qr/r/
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="ejemplo-promo"
              className="flex-1 bg-transparent px-3 py-2.5 text-xs text-white font-mono focus:outline-none"
            />
            {slug && (
              <span className="pr-3 text-emerald-400">
                <Check className="w-4 h-4" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Estilo & Marca (PRO FEATURE) */}
      <div className="p-4 rounded-2xl bg-[#131620] border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-lg bg-amber-400/20 text-amber-400">
              <Palette className="w-4 h-4" />
            </span>
            <span className="text-sm font-bold text-white">Estilo & Marca</span>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 uppercase tracking-wider flex items-center gap-1 border border-amber-400/30">
            <Lock className="w-2.5 h-2.5" />
            PRO FEATURE
          </span>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          Adapta la identidad cromática del código para fusionarlo con la mantelería, soportes de madera o stands acrílicos.
        </p>

        {/* Palette Selector */}
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            COLOR PRIMARIO DEL PATRÓN
          </label>
          <div className="grid grid-cols-4 gap-2">
            {COLOR_PALETTES.map((pal) => {
              const isSelected = selectedPalette === pal.id;
              return (
                <button
                  key={pal.id}
                  onClick={() => {
                    if (!isPro && pal.id !== 'obsidian') {
                      onOpenUpgradeModal();
                      return;
                    }
                    setSelectedPalette(pal.id);
                  }}
                  className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-white/5 text-white'
                      : 'border-white/5 bg-[#0B0D13] text-zinc-400 hover:border-white/10'
                  }`}
                >
                  <div
                    style={{ backgroundColor: pal.circleColor }}
                    className="w-5 h-5 rounded-full flex items-center justify-center shadow-md"
                  >
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-[10px] font-medium">{pal.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Central Logo Toggle */}
        <div className="p-3 rounded-xl bg-[#0B0D13] border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/5 text-zinc-400">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-white block">
                Logotipo Central Vectorial
              </span>
              <span className="text-[10px] text-zinc-400 block">
                Inserta tu logo SVG en el centro del código
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!isPro) {
                onOpenUpgradeModal();
                return;
              }
              setShowCenterLogo(!showCenterLogo);
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              showCenterLogo ? 'bg-indigo-600' : 'bg-zinc-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                showCenterLogo ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Paywall CTA Card inside Pro Feature */}
        {!isPro && (
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#1C1726] to-[#131620] border border-amber-500/25 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="p-1 rounded-lg bg-amber-400/20 text-amber-400 shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h5 className="text-xs font-bold text-white">
                  Desbloquea el Motor Pro Studio
                </h5>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  Colores hex arbitrarios, exportación SVG para serigrafía de mesa, logo personalizado sin pérdida de legibilidad y analíticas de escaneo con el Plan PRO ($19/mes).
                </p>
              </div>
            </div>

            <button
              onClick={onOpenUpgradeModal}
              className="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-glow-gold/20 flex items-center justify-center gap-1.5 transition-all"
            >
              <span>Actualizar a Plan PRO</span>
              <span>→</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. Vincular a Tarjeta o Disco NFC Card (Desactivado en Prototipo) */}
      <div className="w-full p-4 rounded-2xl bg-[#131620]/60 border border-white/5 flex items-center justify-between text-left opacity-60 cursor-not-allowed">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Radio className="w-5 h-5 rotate-90" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-zinc-300">
              Vincular a Tarjeta o Disco NFC (Desactivado)
            </h4>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Disponible en la pestaña Tienda NFC vinculando este enlace
            </p>
          </div>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">PROTOTIPO</span>
      </div>

      {/* 6. Fixed Bottom Action Buttons Dock */}
      <div className="fixed bottom-14 left-0 right-0 z-30 bg-[#0B0D13]/90 backdrop-blur-md border-t border-white/5 py-2 px-4">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled
            title="Asignación a NFC desactivada en este prototipo técnico"
            className="py-3 px-3 rounded-xl bg-[#1E2230]/40 text-zinc-500 text-xs font-semibold flex items-center justify-center gap-2 border border-white/5 cursor-not-allowed opacity-50"
          >
            <Layers className="w-4 h-4 text-zinc-500" />
            <span>Asignar a NFC (Desactivado)</span>
          </button>

          <button
            onClick={handleSaveDynamic}
            disabled={saving}
            className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Guardando...' : 'Guardar Dinámico'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
