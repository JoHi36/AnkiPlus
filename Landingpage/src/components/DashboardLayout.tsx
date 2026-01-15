import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  CreditCard, 
  BarChart3,
  Settings, 
  LogOut
} from 'lucide-react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'Übersicht', path: '/dashboard', active: location.pathname === '/dashboard' },
    { icon: CreditCard, label: 'Abo & Plan', path: '/dashboard/subscription', active: location.pathname === '/dashboard/subscription' },
    { icon: BarChart3, label: 'Statistiken', path: '/dashboard/statistics', active: location.pathname === '/dashboard/statistics' },
    { icon: Settings, label: 'Einstellungen', path: '/dashboard/settings', active: location.pathname === '/dashboard/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col md:flex-row relative overflow-hidden">
      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-[500px] bg-teal-900/10 blur-[120px] pointer-events-none z-0" />
      
      {/* Sidebar */}
      <aside className="fixed bottom-0 w-full z-50 md:relative md:w-72 md:h-screen bg-[#080808]/90 backdrop-blur-xl border-t md:border-t-0 md:border-r border-white/5 flex flex-row md:flex-col justify-between p-4 md:p-6">
        <div className="flex flex-col gap-8">
          <div className="hidden md:flex items-center gap-3 font-bold text-xl tracking-tight cursor-pointer group mb-4" onClick={() => navigate('/dashboard')}>
            <img 
              src="/anki-logo.png" 
              alt="ANKI+" 
              className="h-6 sm:h-7 w-auto object-contain"
            />
          </div>

          <nav className="flex md:flex-col justify-around md:justify-start w-full gap-2">
            {navItems.map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col md:flex-row items-center md:gap-3 p-2 md:px-4 md:py-3 rounded-xl transition-all ${
                  item.active 
                    ? 'text-white bg-white/5 border border-white/5' 
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon className={`w-6 h-6 md:w-5 md:h-5 ${item.active ? 'text-teal-400' : ''}`} />
                <span className="text-[10px] md:text-sm font-medium mt-1 md:mt-0">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* User Profile (Desktop Only) */}
        <div className="hidden md:flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-xs font-bold">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.displayName || user?.email?.split('@')[0] || 'User'}</div>
            <div className="text-xs text-neutral-500 truncate">{user?.email}</div>
          </div>
          <button onClick={handleLogout} className="text-neutral-500 hover:text-white transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative z-10 overflow-y-auto h-screen pb-24 md:pb-10">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-6 pb-2">
          <div className="flex items-center gap-3 font-bold text-xl tracking-tight">
            <img 
              src="/anki-logo.png" 
              alt="ANKI+" 
              className="h-6 sm:h-7 w-auto object-contain"
            />
          </div>
          <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {children}
      </main>
    </div>
  );
}


