import React from 'react';
import {
  Link2,
  QrCode,
  TrendingUp,
  CreditCard,
  Layers,
} from 'lucide-react';

export type TabType = 'links' | 'editor' | 'analytics' | 'hardware' | 'account';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
}) => {
  const tabs = [
    {
      id: 'links' as TabType,
      label: 'ENLACES',
      icon: Link2,
    },
    {
      id: 'editor' as TabType,
      label: 'EDITOR QR',
      icon: QrCode,
    },
    {
      id: 'analytics' as TabType,
      label: 'ANALÍTICAS',
      icon: TrendingUp,
    },
    {
      id: 'hardware' as TabType,
      label: 'TIENDA NFC',
      icon: Layers,
    },
    {
      id: 'account' as TabType,
      label: 'CUENTA',
      icon: CreditCard,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B0D13]/95 backdrop-blur-xl border-t border-white/5 pb-safe">
      <div className="max-w-md mx-auto flex items-center justify-around py-1.5 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
                isActive
                  ? 'text-indigo-400 font-bold scale-105'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-indigo-400 shadow-glow-indigo" />
                )}
              </div>
              <span className={`text-[9px] tracking-wider mt-1 uppercase ${isActive ? 'text-indigo-300 font-bold' : 'font-medium'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
