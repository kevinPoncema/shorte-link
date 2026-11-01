import React from 'react';
import { User, api } from '../services/api';
import { QrCode, LogOut, Sparkles } from 'lucide-react';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  onOpenPlans?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onOpenPlans,
}) => {
  const planName = (user?.plan || 'STARTER').toUpperCase();
  const isPro = planName === 'PRO';

  const handleLogout = () => {
    api.clearSession();
    onLogout();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* Logo / Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-200">
            <QrCode className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              QR Maker
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              Dynamic Shortener
            </span>
          </div>
        </div>

        {/* User Info, Plan Badge & Logout */}
        <div className="flex items-center gap-3 sm:gap-4">
          {user && (
            <div className="hidden text-right text-xs sm:block">
              <span className="block font-medium text-slate-700">{user.email}</span>
            </div>
          )}

          {/* Plan Badge (Clickable para gestionar planes) */}
          <button
            onClick={onOpenPlans}
            data-testid="navbar-plan-badge"
            title="Administrar plan y suscripción"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              isPro
                ? 'border-indigo-300 bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 shadow-sm shadow-indigo-200'
                : 'border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100 focus:ring-indigo-500'
            }`}
          >
            <Sparkles className={`h-3 w-3 ${isPro ? 'text-amber-300' : 'text-indigo-500'}`} />
            <span>{planName}</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </header>
  );
};
