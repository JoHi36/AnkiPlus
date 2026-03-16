import { motion } from 'framer-motion';
import { DashboardLayout } from '../components/DashboardLayout';
import { UsageChart } from '../components/UsageChart';
import { DashboardActivity } from '../components/DashboardActivity';
import { UpgradePrompt } from '../components/UpgradePrompt';
import { useQuota } from '../hooks/useQuota';
import { useUsageHistory } from '../hooks/useUsageHistory';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function StatisticsPage() {
  const { user } = useAuth();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const { quota } = useQuota();
  const { history, loading: historyLoading } = useUsageHistory();

  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
      });
    }
  }, [user]);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 md:mt-10"
        >
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Statistiken</h1>
          <p className="text-neutral-400">Detaillierte Einblicke in deine Nutzung</p>
        </motion.div>

        {/* Upgrade Prompt */}
        {quota && (
          <UpgradePrompt
            tier={userDoc?.tier || 'free'}
            currentUsage={quota.deep.used}
            limit={quota.deep.limit === -1 ? undefined : quota.deep.limit}
          />
        )}

        {/* Usage Chart */}
        {historyLoading ? (
          <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-12 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-neutral-400">Lade Statistiken...</p>
            </div>
          </div>
        ) : history ? (
          <UsageChart
            dailyUsage={history.dailyUsage}
            deepLimit={quota?.deep.limit === -1 ? undefined : quota?.deep.limit}
            flashLimit={quota?.flash.limit === -1 ? undefined : quota?.flash.limit}
          />
        ) : null}

        {/* Activity Timeline */}
        <DashboardActivity />
      </div>
    </DashboardLayout>
  );
}


