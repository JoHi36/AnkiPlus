import { UnifiedQuota } from '../hooks/useUnifiedQuota';
import { UsageHistoryData } from '../hooks/useUsageHistory';

interface TokenUsageBarProps {
  quota: UnifiedQuota;
  history: UsageHistoryData | null;
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function TokenUsageBar({ quota, history }: TokenUsageBarProps) {
  if (quota.isUnlimited) {
    return (
      <div className="mt-6">
        <div className="flex justify-between items-baseline mb-2.5">
          <span className="text-[13px] text-white/[0.5]">Token-Nutzung</span>
          <span className="text-[13px] text-white/[0.35] font-light">Unbegrenzt</span>
        </div>
        {history && <WeekChart history={history} limit={undefined} />}
      </div>
    );
  }

  const pct = quota.limit > 0 ? Math.min((quota.used / quota.limit) * 100, 100) : 0;
  const barColor = quota.isOverLimit
    ? 'bg-gradient-to-r from-amber-500 to-orange-400'
    : 'bg-gradient-to-r from-[#0a84ff] to-[#4facfe]';

  return (
    <div className="mt-6">
      <div className="flex justify-between items-baseline mb-2.5">
        <span className="text-[13px] text-white/[0.5]">Token-Nutzung heute</span>
        <span className="text-[13px] text-white/[0.35] font-light">
          {quota.isOverLimit ? (
            <span className="text-amber-400">Limit erreicht</span>
          ) : (
            <><strong className="text-white/[0.8] font-semibold">{quota.used.toLocaleString('de-DE')}</strong> / {quota.limit.toLocaleString('de-DE')}</>
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

      {history && <WeekChart history={history} limit={quota.limit > 0 ? quota.limit : undefined} />}
    </div>
  );
}

function WeekChart({ history, limit }: { history: UsageHistoryData; limit: number | undefined }) {
  const last7 = history.dailyUsage.slice(-7);
  while (last7.length < 7) last7.unshift({ date: '', deep: 0, flash: 0 });

  const maxVal = limit || Math.max(...last7.map(d => d.deep + d.flash), 1);

  return (
    <div className="flex gap-[6px] mt-4">
      {last7.map((day, i) => {
        const total = day.deep + day.flash;
        const pct = Math.min((total / maxVal) * 100, 100);
        return (
          <div key={i} className="flex-1 text-center">
            <div className="text-[10px] text-white/[0.2] font-light mb-1.5">{DAY_LABELS[i]}</div>
            <div className="h-8 rounded bg-white/[0.04] relative overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 bg-[#0a84ff]/30 rounded"
                style={{ height: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
