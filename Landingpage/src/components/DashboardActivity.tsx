import { motion } from 'framer-motion';
import { Brain, Sparkles, Trophy, ArrowUp, Clock } from 'lucide-react';
import { useState } from 'react';

export interface ActivityItem {
  type: 'session' | 'upgrade' | 'milestone' | 'achievement';
  title: string;
  description: string;
  timestamp: Date;
  icon: React.ReactNode;
}

// Mock data - wird später durch Backend-Daten ersetzt
const mockActivities: ActivityItem[] = [
  {
    type: 'session',
    title: 'Session: Kardiologie Review',
    description: '12 Karten bearbeitet, 3x Deep Mode verwendet',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    icon: <Brain className="w-5 h-5" />,
  },
  {
    type: 'milestone',
    title: '100 Deep Mode Requests erreicht!',
    description: 'Du hast diese Woche 100 Deep Mode Requests genutzt',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    icon: <Trophy className="w-5 h-5" />,
  },
  {
    type: 'session',
    title: 'Session: Anatomie Grundlagen',
    description: '8 Karten bearbeitet, 2x Deep Mode verwendet',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    icon: <Brain className="w-5 h-5" />,
  },
  {
    type: 'achievement',
    title: '7-Tage Streak erreicht!',
    description: 'Du lernst seit 7 Tagen täglich mit ANKI+',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    icon: <Sparkles className="w-5 h-5" />,
  },
];

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `vor ${diffMins} ${diffMins === 1 ? 'Minute' : 'Minuten'}`;
  } else if (diffHours < 24) {
    return `vor ${diffHours} ${diffHours === 1 ? 'Stunde' : 'Stunden'}`;
  } else if (diffDays < 7) {
    return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
  } else {
    return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  }
}

function getActivityColor(type: ActivityItem['type']): string {
  switch (type) {
    case 'session':
      return 'text-teal-400 bg-teal-500/10 border-teal-500/20';
    case 'upgrade':
      return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
    case 'milestone':
      return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    case 'achievement':
      return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
    default:
      return 'text-neutral-400 bg-neutral-500/10 border-neutral-500/20';
  }
}

interface DashboardActivityProps {
  activities?: ActivityItem[];
  maxItems?: number;
}

export function DashboardActivity({ activities = mockActivities, maxItems = 5 }: DashboardActivityProps) {
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [showAll, setShowAll] = useState(false);

  const filteredActivities = activities.filter(activity => {
    if (filter === 'all') return true;
    const now = new Date();
    const diffMs = now.getTime() - activity.timestamp.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (filter === 'today') return diffDays === 0;
    if (filter === 'week') return diffDays < 7;
    if (filter === 'month') return diffDays < 30;
    return true;
  });

  const displayedActivities = showAll 
    ? filteredActivities 
    : filteredActivities.slice(0, maxItems);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-white">Aktuelle Aktivitäten</h3>
        <div className="flex gap-2">
          {(['all', 'today', 'week', 'month'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-teal-500 text-black'
                  : 'bg-white/5 text-neutral-400 hover:bg-white/10'
              }`}
            >
              {f === 'all' ? 'Alle' : f === 'today' ? 'Heute' : f === 'week' ? 'Woche' : 'Monat'}
            </button>
          ))}
        </div>
      </div>

      {displayedActivities.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Noch keine Aktivitäten</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedActivities.map((activity, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className={`p-2 rounded-lg border flex-shrink-0 ${getActivityColor(activity.type)}`}>
                {activity.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white mb-1">{activity.title}</div>
                <div className="text-sm text-neutral-400 mb-2">{activity.description}</div>
                <div className="text-xs text-neutral-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTimestamp(activity.timestamp)}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {filteredActivities.length > maxItems && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-4 py-3 text-sm font-medium text-teal-400 hover:text-teal-300 transition-colors"
        >
          Mehr anzeigen ({filteredActivities.length - maxItems} weitere)
        </button>
      )}

      {showAll && filteredActivities.length > maxItems && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full mt-4 py-3 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
        >
          Weniger anzeigen
        </button>
      )}
    </motion.div>
  );
}

