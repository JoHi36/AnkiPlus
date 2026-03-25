# Website Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 6+ website pages into 3 clean routes with a unified Apple-like design language (blue accent, minimal, elegant).

**Architecture:** Replace separate Login/Register pages with a single tabbed AuthPage. Replace 4-page dashboard (DashboardLayout + sidebar) with a single AccountPage using hero card + collapsible sections. Update AuthCallbackPage styling. Add redirects for old routes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Firebase Auth, Firestore, Stripe, React Router v6

**Spec:** `docs/superpowers/specs/2026-03-19-website-redesign.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `Landingpage/src/pages/AuthPage.tsx` | Combined login + register with tab switch |
| `Landingpage/src/pages/AccountPage.tsx` | Single account page: hero card, usage, collapsed sections |
| `Landingpage/src/components/CollapsibleSection.tsx` | Reusable expand/collapse with CSS transition |
| `Landingpage/src/components/TokenUsageBar.tsx` | Progress bar + weekly mini chart |
| `Landingpage/src/components/AnkiPlusLogo.tsx` | Shared logo: "Anki" (white) + "." (blue) + "plus" (blue) + optional Pro badge |
| `Landingpage/src/components/PageNav.tsx` | Minimal top nav (logo left, links right) used by Auth + Account pages |
| `Landingpage/src/components/PageFooter.tsx` | Shared footer (copyright + links) |
| `Landingpage/src/components/DeleteAccountModal.tsx` | Confirmation modal with typed "LÖSCHEN" |
| `Landingpage/src/hooks/useUnifiedQuota.ts` | Wrapper around useQuota: returns single `{ used, limit, remaining }` |

### Modified Files
| File | Change |
|------|--------|
| `Landingpage/App.tsx` | Replace all routes, add redirects |
| `Landingpage/src/pages/AuthCallbackPage.tsx` | Visual refresh: #0F0F0F bg, blue accent, Anki.plus logo |
| `Landingpage/src/components/ProtectedRoute.tsx` | Update loading spinner: #0F0F0F bg, blue accent |
| `Landingpage/src/components/GoogleSignInButton.tsx` | Restyle to match new design (rounded-[10px], font update) |
| `Landingpage/src/hooks/useUsageHistory.ts` | Move `DailyUsage` interface here (currently imported from UsageChart.tsx which will be deleted) |

### Files to Delete (after new pages are working)
| File | Replaced by |
|------|-------------|
| `Landingpage/src/pages/LoginPage.tsx` | AuthPage.tsx |
| `Landingpage/src/pages/RegisterPage.tsx` | AuthPage.tsx |
| `Landingpage/src/pages/DashboardPage.tsx` | AccountPage.tsx |
| `Landingpage/src/pages/SubscriptionPage.tsx` | AccountPage.tsx |
| `Landingpage/src/pages/StatisticsPage.tsx` | AccountPage.tsx |
| `Landingpage/src/pages/SettingsPage.tsx` | AccountPage.tsx |
| `Landingpage/src/pages/InstallPage.tsx` | Landing page InstallSection |
| `Landingpage/src/components/DashboardLayout.tsx` | PageNav + PageFooter |
| `Landingpage/src/components/AccountOverview.tsx` | AccountPage hero card |
| `Landingpage/src/components/HallOfFameCard.tsx` | Removed |
| `Landingpage/src/components/ConnectionStatusCard.tsx` | CollapsibleSection inline |
| `Landingpage/src/components/UpgradePrompt.tsx` | Removed |
| `Landingpage/src/components/DashboardActivity.tsx` | Removed |
| `Landingpage/src/components/UsageChart.tsx` | TokenUsageBar |

---

## Task 1: Shared UI Components (Logo, Nav, Footer, Collapsible)

**Files:**
- Create: `Landingpage/src/components/AnkiPlusLogo.tsx`
- Create: `Landingpage/src/components/PageNav.tsx`
- Create: `Landingpage/src/components/PageFooter.tsx`
- Create: `Landingpage/src/components/CollapsibleSection.tsx`

These are dependency-free building blocks used by both AuthPage and AccountPage.

- [ ] **Step 1: Create AnkiPlusLogo component**

```tsx
// Landingpage/src/components/AnkiPlusLogo.tsx
import { Link } from 'react-router-dom';

interface AnkiPlusLogoProps {
  showPro?: boolean;
  size?: 'sm' | 'md' | 'lg';
  linkTo?: string;
}

export function AnkiPlusLogo({ showPro = false, size = 'md', linkTo = '/' }: AnkiPlusLogoProps) {
  const fontSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <Link to={linkTo} className={`${fontSize} font-bold tracking-[-0.03em] inline-flex items-center gap-2`}>
      <span className="text-white">Anki</span>
      <span className="text-[#0a84ff]">.plus</span>
      {showPro && (
        <span className="text-[11px] font-medium text-white/40 border border-white/10 rounded-md px-2 py-0.5 ml-1">
          Pro
        </span>
      )}
    </Link>
  );
}
```

- [ ] **Step 2: Create PageNav component**

```tsx
// Landingpage/src/components/PageNav.tsx
import { Link } from 'react-router-dom';
import { AnkiPlusLogo } from './AnkiPlusLogo';

interface PageNavProps {
  rightContent?: React.ReactNode;
}

export function PageNav({ rightContent }: PageNavProps) {
  return (
    <nav className="flex justify-between items-center mb-12 md:mb-16">
      <AnkiPlusLogo />
      <div className="flex items-center gap-4">
        {rightContent || (
          <Link to="/" className="text-[13px] text-white/[0.35] font-light hover:text-white/[0.55] transition-colors">
            Startseite
          </Link>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Create PageFooter component**

```tsx
// Landingpage/src/components/PageFooter.tsx
export function PageFooter() {
  return (
    <footer className="mt-12 pt-5 border-t border-white/[0.06] flex justify-between items-center">
      <span className="text-[11px] text-white/[0.15] font-light">&copy; 2026 Anki.plus</span>
      <div className="flex gap-4">
        <a href="#" className="text-[11px] text-white/[0.15] font-light hover:text-white/[0.35] transition-colors">Datenschutz</a>
        <a href="#" className="text-[11px] text-white/[0.15] font-light hover:text-white/[0.35] transition-colors">Impressum</a>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Create CollapsibleSection component**

```tsx
// Landingpage/src/components/CollapsibleSection.tsx
import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(defaultOpen ? undefined : 0);

  useEffect(() => {
    if (!contentRef.current) return;
    setHeight(open ? contentRef.current.scrollHeight : 0);
  }, [open]);

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center py-[18px] cursor-pointer"
      >
        <span className="text-[14px] font-medium text-white/[0.7]">{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-white/[0.2] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        style={{ height, overflow: 'hidden', transition: 'height 200ms ease' }}
      >
        <div ref={contentRef} className="pb-5">
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify components compile**

Run: `cd Landingpage && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add Landingpage/src/components/AnkiPlusLogo.tsx Landingpage/src/components/PageNav.tsx Landingpage/src/components/PageFooter.tsx Landingpage/src/components/CollapsibleSection.tsx
git commit -m "feat(website): add shared UI components — logo, nav, footer, collapsible"
```

---

## Task 2: Auth Page (Login + Register combined)

**Files:**
- Create: `Landingpage/src/pages/AuthPage.tsx`
- Modify: `Landingpage/src/components/GoogleSignInButton.tsx` (restyle)

**Dependencies:** Task 1 (PageNav, AnkiPlusLogo)

**Key reference files:**
- `Landingpage/src/pages/LoginPage.tsx` — existing login logic (Firebase auth, link-code, password reset)
- `Landingpage/src/pages/RegisterPage.tsx` — existing register logic (validation, terms)
- `Landingpage/src/contexts/AuthContext.tsx` — `login()`, `register()`, `loginWithGoogle()`, `resetPassword()`

- [ ] **Step 1: Restyle GoogleSignInButton**

Modify `Landingpage/src/components/GoogleSignInButton.tsx`:
- Change `rounded-lg` → `rounded-[10px]`
- Change button text to "Mit Google fortfahren"
- Keep all existing logic (loading state, error handling, `onSuccess` callback)

- [ ] **Step 2: Create AuthPage with tab switch and login form**

Create `Landingpage/src/pages/AuthPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { PageNav } from '../components/PageNav';
import { Loader2, AlertCircle } from 'lucide-react';

type AuthTab = 'login' | 'register';

export function AuthPage() {
  const { login, register: registerUser, resetPassword, firebaseConfigured } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkCode = searchParams.get('link');

  const [activeTab, setActiveTab] = useState<AuthTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password reset state
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const callbackUrl = linkCode ? `/auth/callback?link=${linkCode}` : '/auth/callback';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate(callbackUrl);
    } catch (err: any) {
      setError(err.message || 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }
    if (password.length < 6) {
      setError('Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }
    if (!acceptTerms) {
      setError('Bitte akzeptiere die Nutzungsbedingungen');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await registerUser(email, password);
      navigate(callbackUrl);
    } catch (err: any) {
      setError(err.message || 'Registrierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError(null);
    try {
      await resetPassword(resetEmail);
      setResetSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Passwort-Reset fehlgeschlagen');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSuccess = () => navigate(callbackUrl);

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setError(null);
    setShowReset(false);
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white/[0.92] flex flex-col items-center justify-center p-6" style={{ animation: 'fadeIn 300ms ease' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      {/* Top nav — absolute positioned */}
      <div className="absolute top-6 left-6 right-6 max-w-7xl mx-auto">
        <PageNav rightContent={
          <Link to="/" className="text-[13px] text-white/[0.35] font-light hover:text-white/[0.55] transition-colors">
            Startseite
          </Link>
        } />
      </div>

      <div className="w-full max-w-[380px]">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-[-0.03em] mb-1.5">Willkommen.</h1>
          <p className="text-[13px] text-white/[0.35] font-light">
            Melde dich an oder erstelle einen Account.
          </p>
        </div>

        {/* Tab Switch */}
        <div className="flex bg-white/[0.04] rounded-[10px] p-[3px] mb-7">
          {(['login', 'register'] as AuthTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`flex-1 py-2.5 text-[13px] font-medium rounded-[8px] transition-all ${
                activeTab === tab
                  ? 'bg-white/[0.08] text-white/[0.92]'
                  : 'text-white/[0.35] hover:text-white/[0.55]'
              }`}
            >
              {tab === 'login' ? 'Anmelden' : 'Registrieren'}
            </button>
          ))}
        </div>

        {/* Firebase warning */}
        {!firebaseConfigured && (
          <div className="mb-5 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-[10px] flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-amber-400/80">Firebase Auth nicht konfiguriert.</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-[10px] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-red-400">{error}</p>
          </div>
        )}

        {/* Reset success */}
        {resetSuccess && (
          <div className="mb-5 p-3.5 bg-green-500/10 border border-green-500/20 rounded-[10px]">
            <p className="text-[12px] text-green-400">Reset-Link wurde gesendet. Prüfe dein Postfach.</p>
          </div>
        )}

        {showReset ? (
          /* Password Reset Form */
          <>
            <form onSubmit={handleReset} className="space-y-3.5">
              <div>
                <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">E-Mail</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                  placeholder="deine@email.com"
                />
              </div>
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full py-2.5 rounded-[10px] bg-[#0a84ff] text-white text-[13px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {resetLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird gesendet...</> : 'Reset-Link senden'}
              </button>
            </form>
            <button
              onClick={() => { setShowReset(false); setResetSuccess(false); }}
              className="mt-4 w-full py-2 text-[12px] text-white/[0.35] hover:text-white/[0.55] transition-colors"
            >
              Zurück
            </button>
          </>
        ) : (
          /* Login / Register Forms */
          <>
            {/* Google */}
            <GoogleSignInButton onSuccess={handleGoogleSuccess} className="mb-5" />

            {/* Divider */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[11px] text-white/[0.2] font-light">oder</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* Form */}
            <form onSubmit={activeTab === 'login' ? handleLogin : handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">E-Mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                  placeholder="deine@email.com"
                />
              </div>
              <div>
                <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">Passwort</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                  placeholder="••••••••"
                />
              </div>

              {/* Register: confirm password + terms */}
              {activeTab === 'register' && (
                <>
                  <div>
                    <label className="block text-[12px] text-white/[0.35] font-normal mb-1.5">Passwort bestätigen</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5 accent-[#0a84ff]"
                    />
                    <span className="text-[12px] text-white/[0.35] font-light leading-relaxed">
                      Ich akzeptiere die <a href="/terms" className="text-white/[0.5] underline underline-offset-2 decoration-white/[0.15]">Nutzungsbedingungen</a> und <a href="/privacy" className="text-white/[0.5] underline underline-offset-2 decoration-white/[0.15]">Datenschutzrichtlinie</a>
                    </span>
                  </label>
                </>
              )}

              {/* Login: forgot password */}
              {activeTab === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowReset(true)}
                    className="text-[12px] text-[#0a84ff] hover:brightness-110 transition-all"
                  >
                    Passwort vergessen?
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-[10px] bg-[#0a84ff] text-white text-[13px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {activeTab === 'login' ? 'Wird angemeldet...' : 'Wird registriert...'}</>
                ) : (
                  activeTab === 'login' ? 'Anmelden' : 'Registrieren'
                )}
              </button>
            </form>

            {/* Footer text */}
            <p className="text-center text-[12px] text-white/[0.2] font-light mt-4">
              {activeTab === 'login'
                ? <>Mit der Anmeldung akzeptierst du die <a href="/terms" className="text-white/[0.35] underline underline-offset-2 decoration-white/[0.1]">Nutzungsbedingungen</a></>
                : null
              }
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify AuthPage compiles**

Run: `cd Landingpage && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add Landingpage/src/pages/AuthPage.tsx Landingpage/src/components/GoogleSignInButton.tsx
git commit -m "feat(website): add combined AuthPage with tab switch login/register"
```

---

## Task 3: Token Usage Hook + Components

**Files:**
- Create: `Landingpage/src/hooks/useUnifiedQuota.ts`
- Create: `Landingpage/src/components/TokenUsageBar.tsx`

**Dependencies:** None (self-contained)

**Key reference files:**
- `Landingpage/src/hooks/useQuota.ts` — existing `QuotaData` with `deep`/`flash` split
- `Landingpage/src/hooks/useUsageHistory.ts` — `dailyUsage` array

- [ ] **Step 1: Move DailyUsage interface into useUsageHistory.ts**

The `DailyUsage` interface is currently defined in `UsageChart.tsx` (which will be deleted in Task 7). Move it into `useUsageHistory.ts` so it survives deletion.

In `Landingpage/src/hooks/useUsageHistory.ts`, replace:
```ts
import { DailyUsage } from '../components/UsageChart';
```
With:
```ts
export interface DailyUsage {
  date: string; // YYYY-MM-DD
  flash: number;
  deep: number;
}
```

- [ ] **Step 2: Create useUnifiedQuota hook**

```ts
// Landingpage/src/hooks/useUnifiedQuota.ts
import { useQuota } from './useQuota';

export interface UnifiedQuota {
  used: number;
  limit: number;    // -1 for unlimited
  remaining: number; // -1 for unlimited
  tier: 'free' | 'tier1' | 'tier2';
  isOverLimit: boolean;
  isUnlimited: boolean;
}

/**
 * Wraps useQuota to present a single unified token count
 * instead of separate deep/flash mode quotas.
 */
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
```

- [ ] **Step 2: Create TokenUsageBar component**

```tsx
// Landingpage/src/components/TokenUsageBar.tsx
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

      {/* Progress bar */}
      <div className="h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex justify-between mt-2">
        <span className="text-[11px] text-white/[0.2] font-light">Setzt sich täglich zurück</span>
        <span className="text-[11px] text-white/[0.2] font-light">{Math.round(pct)}% verbraucht</span>
      </div>

      {/* Week chart */}
      {history && <WeekChart history={history} limit={quota.limit > 0 ? quota.limit : undefined} />}
    </div>
  );
}

function WeekChart({ history, limit }: { history: UsageHistoryData; limit: number | undefined }) {
  // Get last 7 days from dailyUsage (or pad with zeros)
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
```

- [ ] **Step 3: Verify compiles**

Run: `cd Landingpage && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add Landingpage/src/hooks/useUnifiedQuota.ts Landingpage/src/components/TokenUsageBar.tsx
git commit -m "feat(website): add unified quota hook and token usage bar component"
```

---

## Task 4: Delete Account Modal

**Files:**
- Create: `Landingpage/src/components/DeleteAccountModal.tsx`

**Dependencies:** None

- [ ] **Step 1: Create DeleteAccountModal**

```tsx
// Landingpage/src/components/DeleteAccountModal.tsx
import { useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeleteAccountModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteAccountModal({ open, onClose, onConfirm }: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const canDelete = confirmText === 'LÖSCHEN';

  const handleDelete = async () => {
    if (!canDelete) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#141414] border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-[16px] font-semibold">Account löschen</h3>
        </div>
        <p className="text-[13px] text-white/[0.5] font-light mb-5 leading-relaxed">
          Dein Account und alle Daten werden permanent gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
        </p>
        <div className="mb-5">
          <label className="block text-[12px] text-white/[0.35] mb-1.5">
            Tippe <strong className="text-white/[0.7]">LÖSCHEN</strong> zur Bestätigung
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-red-500/30 transition-colors"
            placeholder="LÖSCHEN"
          />
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-[10px] border border-white/[0.08] text-[13px] text-white/[0.5] hover:bg-white/[0.04] transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || loading}
            className="flex-1 py-2.5 rounded-[10px] bg-red-500/20 border border-red-500/30 text-red-400 text-[13px] font-medium disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add Landingpage/src/components/DeleteAccountModal.tsx
git commit -m "feat(website): add delete account confirmation modal"
```

---

## Task 5: Account Page

**Files:**
- Create: `Landingpage/src/pages/AccountPage.tsx`

**Dependencies:** Tasks 1, 3, 4 (CollapsibleSection, TokenUsageBar, DeleteAccountModal, PageNav, PageFooter)

**Key reference files:**
- `Landingpage/src/pages/DashboardPage.tsx` — user document fetching, quota display
- `Landingpage/src/pages/SettingsPage.tsx` — email/password change, account deletion, Google detection
- `Landingpage/src/pages/SubscriptionPage.tsx` — Stripe portal, checkout success/cancel handling
- `Landingpage/src/utils/userSetup.ts` — `UserDocument` interface, `getUserDocument()`

- [ ] **Step 1: Create AccountPage**

Create `Landingpage/src/pages/AccountPage.tsx` with the following complete implementation:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserDocument, UserDocument } from '../utils/userSetup';
import { useUnifiedQuota } from '../hooks/useUnifiedQuota';
import { useUsageHistory } from '../hooks/useUsageHistory';
import { PageNav } from '../components/PageNav';
import { PageFooter } from '../components/PageFooter';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { TokenUsageBar } from '../components/TokenUsageBar';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { Button } from '@shared/components/Button';
import { Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import { auth } from '../lib/firebase';

const TIER_DISPLAY: Record<string, { name: string; price: string }> = {
  free:  { name: 'Starter',  price: 'Kostenlos' },
  tier1: { name: 'Student',  price: '4,99 € / Monat' },
  tier2: { name: 'Exam Pro', price: '14,99 € / Monat' },
};

const API_URL = import.meta.env.VITE_BACKEND_URL || 'https://europe-west1-ankiplus-b0ffb.cloudfunctions.net/api';

export function AccountPage() {
  const { user, logout, getAuthToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userDoc, setUserDoc] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const { quota } = useUnifiedQuota();
  const { history } = useUsageHistory();

  // Inline edit states
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Stripe
  const [portalLoading, setPortalLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const isGoogleAccount = user?.providerData?.some(p => p.providerId === 'google.com') ?? false;

  // Fetch user document
  useEffect(() => {
    if (user) {
      getUserDocument(user.uid).then((doc) => {
        setUserDoc(doc);
        setNewEmail(user.email || '');
        setLoading(false);
      });
    }
  }, [user]);

  // Handle Stripe success/cancel params
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    if (success) {
      setShowSuccess(true);
      if (user) setTimeout(() => getUserDocument(user.uid).then(setUserDoc), 2000);
      setTimeout(() => { setSearchParams({}, { replace: true }); setShowSuccess(false); }, 5000);
    }
    if (canceled) {
      setShowCancel(true);
      setTimeout(() => { setSearchParams({}, { replace: true }); setShowCancel(false); }, 5000);
    }
  }, [searchParams, user, setSearchParams]);

  // --- Handlers ---
  const handleLogout = async () => { await logout(); navigate('/'); };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`${API_URL}/stripe/create-portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Portal failed');
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { setMessage({ type: 'error', text: 'Fehler beim Öffnen der Abo-Verwaltung.' }); }
    finally { setPortalLoading(false); }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !auth || newEmail === user.email) return;
    setSavingEmail(true); setMessage(null);
    try {
      await updateEmail(user, newEmail);
      setMessage({ type: 'success', text: 'E-Mail aktualisiert.' });
      setEditingEmail(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.code === 'auth/requires-recent-login' ? 'Bitte melde dich erneut an.' : err.message });
    } finally { setSavingEmail(false); }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !auth) return;
    if (newPassword !== confirmPassword) { setMessage({ type: 'error', text: 'Passwörter stimmen nicht überein.' }); return; }
    if (newPassword.length < 6) { setMessage({ type: 'error', text: 'Mindestens 6 Zeichen.' }); return; }
    setSavingPassword(true); setMessage(null);
    try {
      const cred = EmailAuthProvider.credential(user.email || '', currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      setMessage({ type: 'success', text: 'Passwort aktualisiert.' });
      setEditingPassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.code === 'auth/wrong-password' ? 'Aktuelles Passwort ist falsch.' : err.message });
    } finally { setSavingPassword(false); }
  };

  const handleDeleteAccount = async () => {
    if (!user || !auth) return;
    try {
      await deleteUser(user);
      await logout();
      navigate('/');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.code === 'auth/requires-recent-login' ? 'Bitte melde dich erneut an.' : err.message });
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] text-white/[0.92] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#0a84ff]" />
      </div>
    );
  }

  // --- Derived values ---
  const tier = userDoc?.tier || 'free';
  const display = TIER_DISPLAY[tier] || TIER_DISPLAY.free;
  const isCancelled = userDoc?.subscriptionCancelAtPeriodEnd === true;
  const periodEnd = userDoc?.subscriptionCurrentPeriodEnd
    ? new Date(userDoc.subscriptionCurrentPeriodEnd.seconds * 1000).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
    : null;

  const heroGradient = isCancelled
    ? 'from-amber-500/[0.08] to-amber-500/[0.02]'
    : 'from-[#0a84ff]/[0.08] to-[#0a84ff]/[0.02]';
  const heroBorder = isCancelled ? 'border-amber-500/[0.12]' : 'border-[#0a84ff]/[0.12]';

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white/[0.92]" style={{ animation: 'fadeIn 300ms ease' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>

      {/* Toast notifications for Stripe */}
      {(showSuccess || showCancel) && (
        <div className="fixed top-6 right-6 z-50 max-w-sm">
          {showSuccess && (
            <div className="bg-[#141414] border border-green-500/20 rounded-xl p-4 flex items-start gap-3 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" />
              <div className="flex-1"><p className="text-[13px] font-medium">Zahlung erfolgreich!</p><p className="text-[11px] text-white/[0.35]">Dein Abo ist jetzt aktiv.</p></div>
              <button onClick={() => setShowSuccess(false)} className="text-white/[0.2]"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          {showCancel && (
            <div className="bg-[#141414] border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
              <div className="flex-1"><p className="text-[13px] font-medium">Zahlung abgebrochen.</p><p className="text-[11px] text-white/[0.35]">Es wurde nichts abgebucht.</p></div>
              <button onClick={() => setShowCancel(false)} className="text-white/[0.2]"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
      )}

      <div className="max-w-[800px] mx-auto px-6 md:px-10 py-8">
        {/* Nav */}
        <PageNav rightContent={
          <div className="flex items-center gap-4">
            <Link to="/" className="text-[13px] text-white/[0.35] font-light hover:text-white/[0.55] transition-colors">Startseite</Link>
            <Button variant="outline" size="sm" onClick={handleLogout}>Abmelden</Button>
          </div>
        } />

        {/* Message */}
        {message && (
          <div className={`mb-6 p-3.5 rounded-[10px] flex items-start gap-2.5 ${message.type === 'success' ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />}
            <span className="text-[12px] flex-1" style={{ color: message.type === 'success' ? 'rgb(74,222,128)' : 'rgb(248,113,113)' }}>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-white/[0.2]"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* ═══ HERO CARD ═══ */}
        <div className={`bg-gradient-to-br ${heroGradient} border ${heroBorder} rounded-2xl p-8 md:p-9 relative overflow-hidden`}>
          {/* Subtle glow */}
          <div className={`absolute -top-10 -right-10 w-[200px] h-[200px] rounded-full pointer-events-none ${isCancelled ? 'bg-amber-500/[0.08]' : 'bg-[#0a84ff]/[0.08]'}`} style={{ filter: 'blur(60px)' }} />

          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.06em] text-white/[0.35] font-light mb-1.5">Dein Plan</div>
                <h1 className="text-[28px] font-bold tracking-[-0.03em] text-white">{display.name}.</h1>
                <p className="text-[13px] text-white/[0.35] font-light mt-1">
                  {isCancelled && periodEnd
                    ? `Gekündigt — aktiv bis ${periodEnd}`
                    : tier !== 'free' && periodEnd
                    ? `${display.price} — verlängert sich am ${periodEnd}`
                    : display.price}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {tier !== 'tier2' && !isCancelled && (
                  <Button variant="primary" size="sm" asChild>
                    <Link to="/account?upgrade=true">Upgrade</Link>
                  </Button>
                )}
                {tier !== 'free' && (
                  <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verwalten'}
                  </Button>
                )}
              </div>
            </div>

            {/* Token Usage */}
            {quota && <TokenUsageBar quota={quota} history={history} />}
          </div>
        </div>

        {/* ═══ COLLAPSED SECTIONS ═══ */}
        <div className="mt-8">
          <CollapsibleSection title="Verbindung" defaultOpen={true}>
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-green-400' : 'bg-white/[0.15]'}`} />
              <span className="text-[13px] text-white/[0.5] font-light">
                {user ? 'Anki-Plugin verbunden.' : 'Nicht verbunden. Starte Anki und melde dich im Plugin an.'}
              </span>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Account">
            <div className="space-y-0">
              {/* Email row */}
              <div className="flex justify-between items-center py-3.5 border-b border-white/[0.04]">
                <span className="text-[13px] text-white/[0.35] font-light">E-Mail</span>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-white/[0.7]">{user?.email}</span>
                  {!isGoogleAccount ? (
                    <button onClick={() => setEditingEmail(!editingEmail)} className="text-[12px] text-[#0a84ff]">Ändern</button>
                  ) : (
                    <span className="text-[11px] text-white/[0.2]">Google</span>
                  )}
                </div>
              </div>
              {/* Inline email edit */}
              {editingEmail && !isGoogleAccount && (
                <form onSubmit={handleUpdateEmail} className="py-4 space-y-3 border-b border-white/[0.04]">
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="neue@email.com" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingEmail || newEmail === user?.email}
                      className="px-4 py-2 rounded-[8px] bg-[#0a84ff] text-white text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5">
                      {savingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Speichern
                    </button>
                    <button type="button" onClick={() => setEditingEmail(false)}
                      className="px-4 py-2 rounded-[8px] border border-white/[0.08] text-[12px] text-white/[0.5]">Abbrechen</button>
                  </div>
                </form>
              )}

              {/* Password row */}
              <div className="flex justify-between items-center py-3.5 border-b border-white/[0.04]">
                <span className="text-[13px] text-white/[0.35] font-light">Passwort</span>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] text-white/[0.7]">••••••••</span>
                  {!isGoogleAccount ? (
                    <button onClick={() => setEditingPassword(!editingPassword)} className="text-[12px] text-[#0a84ff]">Ändern</button>
                  ) : (
                    <span className="text-[11px] text-white/[0.2]">Google</span>
                  )}
                </div>
              </div>
              {/* Inline password edit */}
              {editingPassword && !isGoogleAccount && (
                <form onSubmit={handleUpdatePassword} className="py-4 space-y-3 border-b border-white/[0.04]">
                  <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="Aktuelles Passwort" />
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="Neues Passwort (min. 6 Zeichen)" />
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6}
                    className="w-full px-3.5 py-2.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] text-white/[0.8] text-[13px] placeholder-white/[0.15] focus:outline-none focus:border-[#0a84ff]/50"
                    placeholder="Passwort bestätigen" />
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingPassword}
                      className="px-4 py-2 rounded-[8px] bg-[#0a84ff] text-white text-[12px] font-medium disabled:opacity-40 flex items-center gap-1.5">
                      {savingPassword ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Speichern
                    </button>
                    <button type="button" onClick={() => { setEditingPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                      className="px-4 py-2 rounded-[8px] border border-white/[0.08] text-[12px] text-white/[0.5]">Abbrechen</button>
                  </div>
                </form>
              )}

              {/* Delete row */}
              <div className="flex justify-between items-center py-3.5">
                <span className="text-[13px] text-white/[0.35] font-light">Account löschen</span>
                <button onClick={() => setShowDeleteModal(true)} className="text-[12px] text-red-400/70 hover:text-red-400 transition-colors">
                  Permanent löschen
                </button>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        <PageFooter />
      </div>

      <DeleteAccountModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} onConfirm={handleDeleteAccount} />
    </div>
  );
}
```

**Notes for implementer:**
- The `?upgrade=true` param on the Upgrade button is a placeholder. For now it can simply link to the PricingGrid on the landing page (`/#pricing`) or open Stripe checkout directly via `CheckoutButton` logic. Decide based on preference.
- Stripe `?success=` and `?canceled=` params from checkout redirect are handled — they show toast notifications and clear themselves after 5 seconds.
- Connection status is simplified: if user is authenticated, show "connected". No "last synced" timestamp (backend doesn't track this).
- The `fadeIn` keyframe is inlined via `<style>` tag for the page-load animation (spec requirement).
- `CheckoutButton.tsx` is kept (used by PricingGrid on landing page) but not directly used here — the hero card's "Upgrade" button links to pricing.

- [ ] **Step 2: Verify compiles**

Run: `cd Landingpage && npx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add Landingpage/src/pages/AccountPage.tsx
git commit -m "feat(website): add AccountPage with hero card and collapsed sections"
```

---

## Task 6: Update Routing + Auth Callback + ProtectedRoute

**Files:**
- Modify: `Landingpage/App.tsx`
- Modify: `Landingpage/src/pages/AuthCallbackPage.tsx`
- Modify: `Landingpage/src/components/ProtectedRoute.tsx`

**Dependencies:** Tasks 2, 5 (AuthPage, AccountPage exist)

- [ ] **Step 1: Update App.tsx routes**

Replace the full content of `Landingpage/App.tsx`:

```tsx
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './src/contexts/AuthContext';
import { ProtectedRoute } from './src/components/ProtectedRoute';
import { LandingPage } from './src/pages/LandingPage';
import { AuthPage } from './src/pages/AuthPage';
import { AccountPage } from './src/pages/AccountPage';
import { AuthCallbackPage } from './src/pages/AuthCallbackPage';

/** Redirect that preserves query params (needed for ?link= forwarding) */
function RedirectWithParams({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={to + location.search} replace />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Active routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
        <Route path="/auth/callback" element={<ProtectedRoute><AuthCallbackPage /></ProtectedRoute>} />

        {/* Redirects for old routes */}
        <Route path="/register" element={<RedirectWithParams to="/login" />} />
        <Route path="/install" element={<Navigate to="/" replace />} />
        <Route path="/dashboard/*" element={<Navigate to="/account" replace />} />
        <Route path="/dashboard" element={<Navigate to="/account" replace />} />

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
```

- [ ] **Step 2: Update ProtectedRoute styling**

In `Landingpage/src/components/ProtectedRoute.tsx`:
- Change `bg-[#030303]` → `bg-[#0F0F0F]`
- Change `border-teal-500/30 border-t-teal-500` → `border-[#0a84ff]/30 border-t-[#0a84ff]`

- [ ] **Step 3: Update AuthCallbackPage styling**

In `Landingpage/src/pages/AuthCallbackPage.tsx`:
- All `bg-[#030303]` → `bg-[#0F0F0F]`
- All `text-teal-*` → `text-[#0a84ff]` or `text-white`
- All `bg-teal-*` → `bg-[#0a84ff]`
- All `border-teal-*` → `border-[#0a84ff]`
- All `bg-green-900/10 blur-[120px]` → remove glow blobs
- Change "Dashboard" button navigation from `/dashboard` → `/account`
- Replace teal-500 spinner with blue: `border-[#0a84ff]/30 border-t-[#0a84ff]`
- Keep ALL functionality unchanged (link-code flow, auto-connect, manual fallback, copy token)

- [ ] **Step 4: Verify compiles and build**

Run: `cd Landingpage && npx tsc --noEmit --pretty && npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add Landingpage/App.tsx Landingpage/src/pages/AuthCallbackPage.tsx Landingpage/src/components/ProtectedRoute.tsx
git commit -m "feat(website): update routing, redirects, and restyle callback page"
```

---

## Task 7: Delete Old Files

**Files:** Delete all files listed in "Files to Delete" section above.

**Dependencies:** Task 6 (new routing is in place, no more imports of old files)

- [ ] **Step 1: Verify no imports of old files remain**

Run: `cd Landingpage && grep -r "LoginPage\|RegisterPage\|DashboardPage\|SubscriptionPage\|StatisticsPage\|SettingsPage\|InstallPage\|DashboardLayout\|AccountOverview\|HallOfFameCard\|ConnectionStatusCard\|UpgradePrompt\|DashboardActivity\|UsageChart" src/ App.tsx --include="*.tsx" --include="*.ts" -l`

Should return empty (no files importing old components). If any files still import them, fix before proceeding.

- [ ] **Step 2: Delete old page files**

```bash
cd Landingpage
rm src/pages/LoginPage.tsx src/pages/RegisterPage.tsx src/pages/DashboardPage.tsx src/pages/SubscriptionPage.tsx src/pages/StatisticsPage.tsx src/pages/SettingsPage.tsx src/pages/InstallPage.tsx
```

- [ ] **Step 3: Delete old component files**

```bash
rm src/components/DashboardLayout.tsx src/components/AccountOverview.tsx src/components/HallOfFameCard.tsx src/components/ConnectionStatusCard.tsx src/components/UpgradePrompt.tsx src/components/DashboardActivity.tsx src/components/UsageChart.tsx
```

- [ ] **Step 4: Verify build still works**

Run: `cd Landingpage && npm run build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add -A Landingpage/src/pages/ Landingpage/src/components/
git commit -m "chore(website): remove old dashboard pages and components"
```

---

## Task 8: Final Verification

**Dependencies:** All previous tasks

- [ ] **Step 1: Full build**

Run: `cd Landingpage && npm run build`

- [ ] **Step 2: Verify route list**

Only these routes should exist in `App.tsx`:
- `/` → LandingPage
- `/login` → AuthPage
- `/account` → AccountPage (protected)
- `/auth/callback` → AuthCallbackPage (protected)
- `/register` → redirect to `/login` (with params)
- `/install` → redirect to `/`
- `/dashboard/*` → redirect to `/account`

- [ ] **Step 3: Manual smoke test checklist**

Run `npm run dev` and check:
- [ ] `/login` shows tab switch (Anmelden/Registrieren), blue accent, no teal
- [ ] Tab switch toggles between login and register forms
- [ ] `/login?link=testcode` preserves link param through both forms
- [ ] `/register` redirects to `/login`
- [ ] `/register?link=abc` redirects to `/login?link=abc`
- [ ] `/dashboard` redirects to `/account`
- [ ] `/dashboard/subscription` redirects to `/account`
- [ ] `/account` shows hero card with plan + usage (requires auth)
- [ ] Collapsed sections expand/collapse with smooth animation
- [ ] Anki.plus logo appears on all pages
- [ ] No teal color anywhere
- [ ] Footer shows on auth + account pages

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(website): final polish and verification fixes"
```
