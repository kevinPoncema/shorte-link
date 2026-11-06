import React from 'react';
import { Lock, Zap, X, ShieldAlert } from 'lucide-react';

interface QuotaWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade: () => void;
  activeCount: number;
  maxLinks: number;
  planName?: string;
}

export const QuotaWarningModal: React.FC<QuotaWarningModalProps> = ({
  isOpen,
  onClose,
  onUpgrade,
  activeCount,
  maxLinks,
  planName = 'STARTER',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-sm rounded-3xl bg-[#131620] border border-amber-500/30 shadow-2xl p-6 flex flex-col items-center text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Warning Icon Badge */}
        <div className="h-14 w-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 mb-4 shadow-glow-gold/20 animate-pulse">
          <ShieldAlert className="w-7 h-7" />
        </div>

        {/* Title & Badge */}
        <div className="space-y-1 mb-4">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
            <Lock className="w-3 h-3 text-amber-400" />
            <span>Límite de Plan Alcanzado</span>
          </div>
          <h3 className="text-base font-black text-white tracking-tight">
            Has alcanzado la cuota máxima
          </h3>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-xs">
            Tu plan <span className="text-amber-400 font-semibold">{planName}</span> permite un máximo de{' '}
            <span className="text-white font-semibold">{maxLinks} enlaces activos</span> simultáneos.
          </p>
        </div>

        {/* Mini KPI Quota Status */}
        <div className="w-full grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#0B0D13] border border-white/5 text-xs mb-4">
          <div className="text-left space-y-0.5">
            <span className="text-[10px] text-zinc-500 uppercase font-semibold">Enlaces Activos</span>
            <div className="text-sm font-bold text-white flex items-center gap-1">
              <span>{activeCount} de {maxLinks}</span>
              <span className="text-[10px] text-rose-400 font-bold">(100%)</span>
            </div>
          </div>
          <div className="text-left space-y-0.5 border-l border-white/5 pl-3">
            <span className="text-[10px] text-zinc-500 uppercase font-semibold">Cupos Libres</span>
            <div className="text-sm font-bold text-amber-400 flex items-center gap-1">
              <span>0 enlaces</span>
              <Lock className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* Recommendation text */}
        <p className="text-[11px] text-zinc-400 text-left leading-relaxed mb-5 bg-white/5 p-3 rounded-xl border border-white/5">
          💡 Para crear nuevos enlaces dinámicos o reactivar enlaces pausados, puedes actualizar a{' '}
          <strong className="text-white">Plan PRO</strong> (hasta 50 enlaces) o eliminar/pausar alguno de tus enlaces existentes.
        </p>

        {/* Action Buttons */}
        <div className="w-full space-y-2">
          <button
            onClick={() => {
              onClose();
              onUpgrade();
            }}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-glow-gold/20 transition-all"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Desbloquear 50 con Plan PRO</span>
          </button>

          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-semibold text-xs transition-colors"
          >
            Gestionar Enlaces Existentes
          </button>
        </div>
      </div>
    </div>
  );
};
