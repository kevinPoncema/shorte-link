import React from 'react';
import { User } from '../../services/api';

interface HeaderProps {
  user: User | null;
  onOpenAccount: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onOpenAccount,
}) => {
  const isPro = (user?.plan || 'STARTER').toUpperCase() === 'PRO';

  return (
    <header className="sticky top-0 z-30 bg-[#0B0D13]/90 backdrop-blur-md border-b border-white/5 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        {/* Brand Logo */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-[1.5px] shadow-glow-indigo flex items-center justify-center shrink-0">
            <div className="h-full w-full bg-[#0B0D13] rounded-[10px] flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 text-indigo-400"
              >
                <rect width="5" height="5" x="3" y="3" rx="1" />
                <rect width="5" height="5" x="16" y="3" rx="1" />
                <rect width="5" height="5" x="3" y="16" rx="1" />
                <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
                <path d="M21 21v.01" />
                <path d="M12 7v3a2 2 0 0 1-2 2H7" />
                <path d="M3 12h.01" />
                <path d="M12 3h.01" />
                <path d="M12 16v.01" />
                <path d="M16 12h1" />
                <path d="M21 12v.01" />
                <path d="M12 21v-1" />
              </svg>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-bold tracking-tight text-white">
              KinetiQR
            </span>
            <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">
              NFC
            </span>
          </div>
        </div>

        {/* Right Section: Plan Pill (Abre modal de suscripción/cuenta) */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenAccount}
            className="flex items-center gap-1.5 bg-[#131620] hover:bg-[#1A1E2D] border border-amber-500/20 rounded-full px-2.5 py-1 text-xs transition-colors shadow-glow-gold/10"
          >
            <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
              {isPro ? 'PRO' : 'STARTER'}
            </span>
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-0.5">
              {isPro ? 'Plan Activo' : 'Upgrade Pro'}
              <span className="text-amber-400 font-bold">→</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
