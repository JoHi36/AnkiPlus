import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { 
  LayoutDashboard, 
  CreditCard, 
  Sparkles, 
  Settings, 
  LogOut,
  Brain,
  Clock,
  Flame,
  Check,
  FileText,
  ChevronRight
} from 'lucide-react';

const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } 
  }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  }
};

export function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
        setLoading(false);
      });
    }
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400">Lade Dashboard...</p>
        </div>
      </div>
    );
  }

  const tierDisplayName = userDoc?.tier === 'free' ? 'Starter' : userDoc?.tier === 'tier1' ? 'Student' : 'Exam Pro';
  const tierColor = userDoc?.tier === 'free' ? 'teal' : userDoc?.tier === 'tier1' ? 'teal' : 'purple';

  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col md:flex-row relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="fixed top-0 left-0 w-full h-[500px] bg-teal-900/10 blur-[120px] pointer-events-none z-0" />
      
      {/* Sidebar */}
      <aside className="fixed bottom-0 w-full z-50 md:relative md:w-72 md:h-screen bg-[#080808]/90 backdrop-blur-xl border-t md:border-t-0 md:border-r border-white/5 flex flex-row md:flex-col justify-between p-4 md:p-6">
        
        <div className="flex flex-col gap-8">
           <div className="hidden md:flex items-center gap-3 font-bold text-xl tracking-tight cursor-pointer group mb-4">
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center border border-teal-500/20">
                <span className="text-teal-400 text-sm">A+</span>
              </div>
              <span className="text-white">ANKI+</span>
            </div>

            <nav className="flex md:flex-col justify-around md:justify-start w-full gap-2">
              {[
                { icon: LayoutDashboard, label: 'Übersicht', active: true },
                { icon: CreditCard, label: 'Abo & Plan', active: false },
                { icon: Sparkles, label: 'Deep Mode', active: false },
                { icon: Settings, label: 'Einstellungen', active: false },
              ].map((item, i) => (
                <button key={i} className={`flex flex-col md:flex-row items-center md:gap-3 p-2 md:px-4 md:py-3 rounded-xl transition-all ${item.active ? 'text-white bg-white/5 border border-white/5' : 'text-neutral-500 hover:text-white hover:bg-white/5'}`}>
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
              <div className="w-8 h-8 bg-teal-500/10 rounded-lg flex items-center justify-center border border-teal-500/20">
                <span className="text-teal-400 text-sm">A+</span>
              </div>
              <span className="text-white">ANKI+</span>
            </div>
            <button onClick={handleLogout} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-neutral-400">
               <LogOut className="w-4 h-4" />
            </button>
        </div>

        <div className="max-w-5xl mx-auto p-6 space-y-10">
          
          {/* Header & Status */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-4 md:mt-10"
          >
            <div>
               <h1 className="text-3xl md:text-4xl font-bold mb-2">
                 Willkommen zurück, {user?.displayName || user?.email?.split('@')[0] || 'User'}
               </h1>
               <p className="text-neutral-400">Hier ist dein Lern-Überblick für heute.</p>
            </div>
            
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-${tierColor}-900/40 to-${tierColor === 'purple' ? 'blue' : tierColor}-900/40 border border-${tierColor}-500/30 shadow-[0_0_20px_-5px_rgba(20,184,166,0.3)] backdrop-blur-md`}>
               <Sparkles className={`w-4 h-4 text-${tierColor}-300 fill-${tierColor}-300`} />
               <span className={`text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-${tierColor}-200 to-${tierColor === 'purple' ? 'blue' : tierColor}-200 uppercase tracking-wide`}>
                 Plan: {tierDisplayName}
               </span>
            </div>
          </motion.div>

          {/* Usage Stats */}
          <motion.div 
             variants={staggerContainer}
             initial="hidden"
             animate="visible"
             className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
             {/* Deep Mode Credits */}
             <motion.div variants={fadeInUp} className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 blur-[50px] rounded-full group-hover:bg-purple-500/20 transition-all" />
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                         <Brain className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-medium bg-white/5 px-2 py-1 rounded text-neutral-400">Reset: 00:00</span>
                   </div>
                   <div className="text-neutral-400 text-sm font-medium mb-1">Deep Mode Credits</div>
                   <div className="text-2xl font-bold text-white mb-4">
                     {userDoc?.tier === 'free' ? '3' : userDoc?.tier === 'tier1' ? '50' : '∞'} 
                     <span className="text-neutral-500 text-lg font-normal"> verfügbar</span>
                   </div>
                   
                   <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: userDoc?.tier === 'free' ? '100%' : '24%' }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                      />
                   </div>
                </div>
             </motion.div>

             {/* Time Saved */}
             <motion.div variants={fadeInUp} className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 blur-[50px] rounded-full group-hover:bg-teal-500/20 transition-all" />
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400">
                         <Clock className="w-5 h-5" />
                      </div>
                   </div>
                   <div className="text-neutral-400 text-sm font-medium mb-1">Gesparte Zeit (Heute)</div>
                   <div className="text-2xl font-bold text-white mb-2">~ 45 <span className="text-neutral-500 text-lg font-normal">Minuten</span></div>
                   <p className="text-xs text-neutral-500">Durch schnelle KI-Erklärungen statt manueller Recherche.</p>
                </div>
             </motion.div>

             {/* Streak */}
             <motion.div variants={fadeInUp} className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-[50px] rounded-full group-hover:bg-orange-500/20 transition-all" />
                <div className="relative z-10">
                   <div className="flex justify-between items-start mb-4">
                      <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                         <Flame className="w-5 h-5" />
                      </div>
                   </div>
                   <div className="text-neutral-400 text-sm font-medium mb-1">Lern-Streak</div>
                   <div className="text-2xl font-bold text-white mb-2">14 <span className="text-neutral-500 text-lg font-normal">Tage</span></div>
                   <p className="text-xs text-neutral-500">Du bist im Flow! Lern morgen weiter um den Streak zu halten.</p>
                </div>
             </motion.div>
          </motion.div>

          {/* Subscription */}
          <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.4 }}
             className="bg-[#0A0A0A] border border-white/10 rounded-3xl p-8 relative overflow-hidden"
          >
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                <div>
                   <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-white">{tierDisplayName} (Monatlich)</h3>
                      <span className="px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Aktiv
                      </span>
                   </div>
                   <div className="text-neutral-400 text-sm mb-4">
                     {userDoc?.tier === 'free' ? '0€' : userDoc?.tier === 'tier1' ? '4,99€' : '14,99€'} pro Monat
                   </div>
                   <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <Check className="w-3 h-3 text-teal-500" />
                      <span>
                        {userDoc?.tier === 'free' 
                          ? '3x Deep Mode pro Tag inklusive'
                          : userDoc?.tier === 'tier1'
                          ? '50x Deep Mode pro Tag inklusive'
                          : 'Unbegrenzter Deep Mode inklusive'}
                      </span>
                   </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                   <button className="flex-1 md:flex-none px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-medium hover:bg-white/10 transition-colors">
                      Plan verwalten
                   </button>
                   <button className="p-2.5 rounded-lg bg-white/5 border border-white/10 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors" title="Rechnung herunterladen">
                      <FileText className="w-5 h-5" />
                   </button>
                </div>
             </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

