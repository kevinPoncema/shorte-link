import { useState } from 'react';
import { api, User } from './services/api';
import { Navbar } from './components/Navbar';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

export function App() {
  const [user, setUser] = useState<User | null>(() => api.getCurrentUser());
  const token = localStorage.getItem('token');
  const isAuthenticated = Boolean(token && user);

  const handleAuthSuccess = (authenticatedUser: User) => {
    setUser(authenticatedUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {isAuthenticated ? (
        <>
          <Navbar user={user} onLogout={handleLogout} />
          <DashboardPage />
        </>
      ) : (
        <AuthPage onAuthSuccess={handleAuthSuccess} />
      )}
    </div>
  );
}

export default App;
