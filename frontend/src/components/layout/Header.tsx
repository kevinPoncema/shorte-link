import React, { useState } from 'react';
import { User } from '../../services/api';
import { ChevronsUpDown, Check } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  onOpenAccount: () => void;
  currentWorkspace?: string;
  onSelectWorkspace?: (workspace: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onOpenAccount,
  currentWorkspace = 'Restaurante Central',
  onSelectWorkspace,
}) => {
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const isPro = (user?.plan || 'STARTER').toUpperCase() === 'PRO';

  const workspaces = [
    'Restaurante Central',
    'Sucursal Zona Rosa',
    'Bar & Terraza Lounge',
  ];

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

        {/* Right Section: Workspace Dropdown + Plan Pill + Avatar */}
        <div className="flex items-center gap-2">
          {/* Workspace selector */}
          <div className="relative">
            <button
              onClick={() => setIsWorkspaceMenuOpen(!isWorkspaceMenuOpen)}
              className="flex items-center gap-1 bg-[#131620] hover:bg-[#1A1E2D] border border-white/5 rounded-full px-2.5 py-1 text-xs text-zinc-300 font-medium transition-colors"
            >
              <span className="max-w-[90px] truncate text-[11px]">
                {currentWorkspace}
              </span>
              <ChevronsUpDown className="w-3 h-3 text-zinc-400 shrink-0" />
            </button>

            {isWorkspaceMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-xl bg-[#131620] border border-white/10 shadow-2xl p-1 z-50 text-xs">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Tus Espacios
                </div>
                {workspaces.map((ws) => (
                  <button
                    key={ws}
                    onClick={() => {
                      if (onSelectWorkspace) onSelectWorkspace(ws);
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-zinc-300 hover:bg-white/5 hover:text-white transition-colors"
                  >
                    <span className="truncate">{ws}</span>
                    {ws === currentWorkspace && (
                      <Check className="w-3.5 h-3.5 text-indigo-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Plan Pill */}
          <button
            onClick={onOpenAccount}
            className="flex items-center gap-1.5 bg-[#131620] hover:bg-[#1A1E2D] border border-amber-500/20 rounded-full px-2 py-0.5 text-xs transition-colors shadow-glow-gold/10"
          >
            <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
              {isPro ? 'PRO' : 'STARTER'}
            </span>
            <span className="text-[11px] font-bold text-amber-400 flex items-center gap-0.5">
              {isPro ? 'Activo' : 'Upgrade Pro'}
              <span className="text-amber-400 font-bold">→</span>
            </span>
          </button>

          {/* Avatar */}
          <button
            onClick={onOpenAccount}
            title={user?.email || 'Mi Perfil'}
            className="relative h-8 w-8 rounded-full overflow-hidden border border-white/15 ring-1 ring-white/10 shrink-0 hover:ring-indigo-400 transition-all"
          >
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80"
              alt="Avatar"
              className="h-full w-full object-cover"
            />
          </button>
        </div>
      </div>
    </header>
  );
};
