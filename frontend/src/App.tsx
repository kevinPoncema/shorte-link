import { useEffect, useState } from 'react';
import { api, User, LinkItem } from './services/api';
import { Header } from './components/layout/Header';
import { BottomNav, TabType } from './components/layout/BottomNav';
import { Toast, ToastMessage } from './components/layout/Toast';
import { AccountModal } from './components/modals/AccountModal';
import { QrPreviewModal } from './components/modals/QrPreviewModal';
import { AuthPage } from './pages/AuthPage';
import { LinksDashboardView } from './pages/LinksDashboardView';
import { QrEditorView } from './pages/QrEditorView';
import { AnalyticsView } from './pages/AnalyticsView';
import { NfcStoreView } from './pages/NfcStoreView';
import { StripeSandboxPage } from './pages/StripeSandboxPage';

export function App() {
  const [user, setUser] = useState<User | null>(() => api.getCurrentUser());
  const [activeTab, setActiveTab] = useState<TabType>('links');

  // Modals & Navigation state
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [previewingLink, setPreviewingLink] = useState<LinkItem | null>(null);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [selectedAnalyticsLinkId, setSelectedAnalyticsLinkId] = useState<string | null>(null);
  const [hardwareTargetLink, setHardwareTargetLink] = useState<LinkItem | null>(null);

  // Toast state
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const token = localStorage.getItem('token');
  const isAuthenticated = Boolean(token && user);
  const sandboxMode = new URLSearchParams(window.location.search).get('stripe_sandbox');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({
      id: Date.now().toString(),
      type,
      message,
    });
  };

  useEffect(() => {
    // Detect Stripe redirect URL parameters
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const orderStatus = params.get('order');

    if (paymentStatus === 'success') {
      showToast('¡Pago completado con éxito! Tu plan ha sido actualizado a PRO.', 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentStatus === 'cancelled') {
      showToast('Sesión de pago cancelada. Puedes retomar el cambio de plan cuando desees.', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (orderStatus === 'success') {
      showToast('¡Orden de hardware NFC/QR confirmada! Tu pedido pasó a manufactura.', 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (orderStatus === 'cancelled') {
      showToast('Solicitud de pedido físico cancelada.', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (token) {
      api
        .getMe()
        .then((updated) => {
          if (updated) setUser(updated);
        })
        .catch(() => {});
    }
  }, [token]);

  const handleTabChange = (tab: TabType) => {
    if (tab === 'account') {
      setIsAccountModalOpen(true);
      return;
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToEditor = (linkToEdit?: LinkItem) => {
    setEditingLink(linkToEdit || null);
    setActiveTab('editor');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToAnalytics = (linkId: string) => {
    setSelectedAnalyticsLinkId(linkId);
    setActiveTab('analytics');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderPhysical = (link: LinkItem) => {
    setHardwareTargetLink(link);
    setActiveTab('hardware');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    api.clearSession();
    setUser(null);
    setIsAccountModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0B0D13] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {isAuthenticated && (sandboxMode === 'checkout' || sandboxMode === 'portal') ? (
        <StripeSandboxPage currentUser={user} />
      ) : isAuthenticated ? (
        <div className="min-h-screen flex flex-col">
          {/* Header */}
          <Header
            user={user}
            onOpenAccount={() => setIsAccountModalOpen(true)}
          />

          {/* Main Content Centered Mobile App Shell */}
          <main className="flex-1 w-full max-w-md mx-auto px-4 pt-4">
            {activeTab === 'links' && (
              <LinksDashboardView
                currentUser={user}
                onNavigateToEditor={handleNavigateToEditor}
                onNavigateToAnalytics={handleNavigateToAnalytics}
                onOpenUpgradeModal={() => setIsAccountModalOpen(true)}
                onShowToast={showToast}
                onPreviewQr={(link) => setPreviewingLink(link)}
                onOrderPhysical={handleOrderPhysical}
              />
            )}

            {activeTab === 'editor' && (
              <QrEditorView
                currentUser={user}
                linkToEdit={editingLink}
                onSaved={(saved) => {
                  setEditingLink(saved);
                  setActiveTab('links');
                }}
                onAssignToNfc={handleOrderPhysical}
                onOpenUpgradeModal={() => setIsAccountModalOpen(true)}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                currentUser={user}
                linkId={selectedAnalyticsLinkId}
                onBack={() => setActiveTab('links')}
                onOpenUpgradeModal={() => setIsAccountModalOpen(true)}
                onShowToast={showToast}
              />
            )}

            {activeTab === 'hardware' && (
              <NfcStoreView
                currentUser={user}
                preselectedLink={hardwareTargetLink}
                onShowToast={showToast}
              />
            )}
          </main>

          {/* Fixed Bottom Navigation */}
          <BottomNav activeTab={activeTab} onChangeTab={handleTabChange} />

          {/* Modals */}
          <AccountModal
            isOpen={isAccountModalOpen}
            onClose={() => setIsAccountModalOpen(false)}
            currentUser={user}
            onUserUpdated={(updated) => setUser(updated)}
            onLogout={handleLogout}
          />

          <QrPreviewModal
            link={previewingLink}
            onClose={() => setPreviewingLink(null)}
            onShowToast={showToast}
          />
        </div>
      ) : (
        <AuthPage onAuthSuccess={(authUser) => setUser(authUser)} />
      )}
    </div>
  );
}

export default App;
