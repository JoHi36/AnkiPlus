import { useQuota } from './useQuota';

export interface UnifiedQuota {
  daily: { used: number; limit: number; remaining: number };
  weekly: { used: number; limit: number; remaining: number };
  tier: 'free' | 'tier1' | 'tier2';
  isOverDailyLimit: boolean;
  isOverWeeklyLimit: boolean;
}

export function useUnifiedQuota() {
  const { quota, loading, error, refetch } = useQuota();

  const unified: UnifiedQuota | null = quota?.tokens ? {
    daily: quota.tokens.daily,
    weekly: quota.tokens.weekly,
    tier: quota.tier,
    isOverDailyLimit: quota.tokens.daily.remaining <= 0,
    isOverWeeklyLimit: quota.tokens.weekly.remaining <= 0,
  } : null;

  return { quota: unified, loading, error, refetch };
}
