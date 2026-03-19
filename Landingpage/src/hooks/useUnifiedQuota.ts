import { useQuota } from './useQuota';

export interface UnifiedQuota {
  used: number;
  limit: number;    // -1 for unlimited
  remaining: number; // -1 for unlimited
  tier: 'free' | 'tier1' | 'tier2';
  isOverLimit: boolean;
  isUnlimited: boolean;
}

export function useUnifiedQuota() {
  const { quota, loading, error, refetch } = useQuota();

  const unified: UnifiedQuota | null = quota ? {
    used: quota.deep.used + quota.flash.used,
    limit: quota.deep.limit === -1 ? -1 : quota.deep.limit + (quota.flash.limit === -1 ? 0 : quota.flash.limit),
    remaining: quota.deep.remaining === -1 ? -1 : quota.deep.remaining + (quota.flash.remaining === -1 ? 0 : quota.flash.remaining),
    tier: quota.tier,
    isOverLimit: quota.deep.limit !== -1 && quota.deep.remaining <= 0,
    isUnlimited: quota.deep.limit === -1,
  } : null;

  return { quota: unified, loading, error, refetch };
}
