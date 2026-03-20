import { UnifiedQuota } from '../hooks/useUnifiedQuota';
import { UsageHistoryData } from '../hooks/useUsageHistory';

interface TokenUsageBarProps {
  quota: UnifiedQuota;
  history: UsageHistoryData | null;
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('de-DE');
};

export function TokenUsageBar({ quota, history }: TokenUsageBarProps) {
  const pct = quota.daily.limit > 0
    ? Math.min((quota.daily.used / quota.daily.limit) * 100, 100) : 0;
  const barColor = quota.isOverDailyLimit
    ? 'bg-gradient-to-r from-amber-500 to-orange-400'
    : 'bg-gradient-to-r from-[#0a84ff] to-[#4facfe]';

  return (
    <div className="mt-6">
      <div className="flex justify-between items-baseline mb-2.5">
        <span className="text-[13px] text-white/[0.5]">Token-Nutzung heute</span>
        <span className="text-[13px] text-white/[0.35] font-light">
          {quota.isOverDailyLimit ? (
            <span className="text-amber-400">Tageslimit erreicht</span>
          ) : (
            <><strong className="text-white/[0.8] font-semibold">{formatTokens(quota.daily.used)}</strong> / {formatTokens(quota.daily.limit)}</>
          )}
        </span>
      </div>
      <div className="h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[11px] text-white/[0.2] font-light">Setzt sich täglich zurück</span>
        <span className="text-[11px] text-white/[0.2] font-light">{Math.round(pct)}% verbraucht</span>
      </div>
      {quota.weekly.limit > 0 && (
        <div className="mt-3 flex justify-between text-[11px] text-white/[0.2] font-light">
          <span>Woche: {formatTokens(quota.weekly.used)} / {formatTokens(quota.weekly.limit)}</span>
          <span>{Math.round((quota.weekly.used / quota.weekly.limit) * 100)}%</span>
        </div>
      )}
      {history && <WeekChart history={history} limit={quota.daily.limit} />}
    </div>
  );
}

function WeekChart({ history, limit }: { history: UsageHistoryData; limit: number }) {
  const last7 = history.dailyUsage.slice(-7);
  while (last7.length < 7) last7.unshift({ date: '', tokens: 0, requests: 0, flash: 0, deep: 0 });
  const maxVal = limit || Math.max(...last7.map(d => d.tokens), 1);
  return (
    <div className="flex gap-[6px] mt-4">
      {last7.map((day, i) => {
        const pct = Math.min((day.tokens / maxVal) * 100, 100);
        return (
          <div key={i} className="flex-1 text-center">
            <div className="text-[10px] text-white/[0.2] font-light mb-1.5">{DAY_LABELS[i]}</div>
            <div className="h-8 rounded bg-white/[0.04] relative overflow-hidden">
              <div className="absolute bottom-0 left-0 right-0 bg-[#0a84ff]/30 rounded" style={{ height: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
