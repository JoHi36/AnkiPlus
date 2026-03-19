# Website Redesign Spec — Auth & Account Pages

**Date:** 2026-03-19
**Status:** Approved

## Overview

Redesign the ANKI+ website (Landingpage/) to match the new Apple-like design language already applied to the landing page. Consolidate 6+ pages into 3 clean routes. Replace teal-accented SaaS dashboard aesthetic with the minimal, elegant blue-accent design.

## Design Language Reference

The new landing page (`/`) establishes the design system:
- **Background:** #0F0F0F
- **Primary accent:** #0a84ff (blue)
- **Text primary:** rgba(255,255,255,0.92)
- **Text secondary:** rgba(255,255,255,0.35)
- **Text tertiary:** rgba(255,255,255,0.18)
- **Typography:** font-light for body, -0.04em tracking for headlines, font-weight 700 for headings
- **Borders:** rgba(255,255,255,0.06)
- **Headlines:** End with a period ("Willkommen.", "Einfache Preise.")
- **Buttons:** Shared `<Button>` component from `@shared/components/Button`
- **Logo:** "Anki" (white) + "." (blue #0a84ff) + "plus" (blue) + optional "Pro" badge (rounded rect, subtle)

## Route Structure

### Before (6+ routes)
- `/` — Landing (already redesigned)
- `/login` — Login
- `/register` — Register
- `/install` — Install guide
- `/dashboard` — Overview
- `/dashboard/subscription` — Subscription
- `/dashboard/statistics` — Statistics
- `/dashboard/settings` — Settings
- `/auth/callback` — Auth callback

### After (3 routes + callback)
| Route | Purpose |
|-------|---------|
| `/` | Landing page (no changes, already done) |
| `/login` | Combined auth page (login + register via tab switch) |
| `/account` | Single account page (hero + collapsed details) |
| `/auth/callback` | Auth callback (minimal visual refresh only) |

### Removed
- `/register` — merged into `/login`
- `/install` — already integrated as section on landing page
- `/dashboard` — replaced by `/account`
- `/dashboard/subscription` — merged into `/account`
- `/dashboard/statistics` — merged into `/account` (token usage bar)
- `/dashboard/settings` — merged into `/account`

## Page Designs

### 1. Auth Page (`/login`)

**Layout:** Centered card, vertically centered on page

**Structure:**
1. **Top nav:** Anki.plus logo (left) + "Startseite" link (right)
2. **Headline:** "Willkommen." (24px, bold, -0.03em tracking)
3. **Subtitle:** "Melde dich an oder erstelle einen Account." (13px, rgba(255,255,255,0.35), font-light)
4. **Tab Switch:** Segmented control with two tabs ("Anmelden" / "Registrieren")
   - Background: rgba(255,255,255,0.04), rounded-[10px], 3px padding
   - Active tab: rgba(255,255,255,0.08) background, white text
   - Inactive: rgba(255,255,255,0.35) text
5. **Google Sign-In button** (full width, outline style)
6. **Divider:** "oder" with horizontal lines
7. **Form fields:**
   - Login: E-Mail + Passwort + "Passwort vergessen?" link
   - Register: E-Mail + Passwort + Passwort bestätigen + AGB-Checkbox
8. **Submit button:** Blue (#0a84ff), full width
9. **Footer text:** AGB/Nutzungsbedingungen link

**Removed from old login/register:**
- Grid pattern background
- Teal atmospheric glow blobs
- Large blurred background logo
- Separate /register page
- Teal-colored buttons and accents

**Preserved:**
- Link-code flow (URL param `?link={code}` passed through to /auth/callback)
- Google Sign-In
- Password reset flow (inline, same as current toggle)
- Firebase auth integration
- German error messages

### 2. Account Page (`/account`)

**Layout:** Single page, no sidebar, max-width ~800px centered

**Structure:**

#### Top Navigation
- Anki.plus logo (left)
- "Startseite" link + "Abmelden" button (right, outline style)

#### Hero Card (prominent, top)
- Subtle blue gradient background: `linear-gradient(135deg, rgba(10,132,255,0.08), rgba(10,132,255,0.02))`
- Border: `rgba(10,132,255,0.12)`
- Soft blue radial glow in top-right corner
- **Content:**
  - Label: "Dein Plan" (11px, uppercase, 0.06em tracking, rgba(255,255,255,0.35))
  - Plan name: Large heading (28px, bold, -0.03em tracking) e.g. "Student."
  - Price + renewal: "4,99 € / Monat — verlängert sich am 14. Apr." (13px, rgba(255,255,255,0.35))
  - Buttons: "Upgrade" (blue primary) + "Verwalten" (outline) — Verwalten opens Stripe portal
  - **Token Usage Section:**
    - Label row: "Token-Nutzung diese Woche" (left) + "12.400 / 30.000 Tokens" (right)
    - Progress bar: 6px, blue gradient fill on rgba(255,255,255,0.06) background
    - Meta row: "Setzt sich montags zurück" (left) + "41% verbraucht" (right)
    - **Week visualization:** 7 small vertical bars (Mo-So), each showing daily usage proportion
      - Bar background: rgba(255,255,255,0.04)
      - Bar fill: rgba(10,132,255,0.3), anchored to bottom

#### Collapsed Section: Verbindung
- Clickable header: "Verbindung" + chevron arrow
- Expanded content: Green dot + "Anki-Plugin verbunden — zuletzt synchronisiert vor X Min."
- Disconnected state: Gray dot + reconnect instructions

#### Collapsed Section: Account
- Clickable header: "Account" + chevron arrow
- Expanded content:
  - E-Mail row: label + value + "Ändern" link (blue)
  - Passwort row: label + "••••••••" + "Ändern" link (blue)
  - Account löschen row: label + "Permanent löschen" link (red, rgba(255,59,48,0.7))
  - Clicking "Ändern" expands inline edit form (same page, no modal)
  - Google accounts: show "Von Google verwaltet" instead of edit links

#### Footer
- Same as landing page: "© 2025 ANKI+" + Datenschutz + Impressum links

**Removed from old dashboard:**
- Sidebar navigation (DashboardLayout)
- 4 separate sub-pages
- Lern-Streak card
- "Gesparte Zeit" card
- Hall of Fame / Leaderboard
- Activity Timeline
- Testimonial Editor
- App-Settings placeholders (Notifications, Sprache, Datenschutz)
- Deep/Flash mode distinction
- Teal accent color
- Gradient badges, pulse animations, blur glow blobs
- Framer Motion stagger animations on cards

**Preserved:**
- Stripe portal integration (checkout + management)
- Firebase user document fetching
- Quota hooks (adapted for token-based display)
- Connection status check
- Account management (email, password, delete with reauthentication)
- Google account detection (disable email/password changes)
- Stripe checkout success/cancel URL params handling

### 3. Auth Callback (`/auth/callback`)

Minimal visual refresh only:
- Match new background (#0F0F0F) and typography
- Blue accent instead of teal/green for success states
- Keep all functionality: link-code flow, auto-connect, manual fallback
- Use Anki.plus logo

## Components to Create/Modify

### New Components
- **`AuthPage.tsx`** — replaces LoginPage + RegisterPage
- **`AccountPage.tsx`** — replaces DashboardPage + SubscriptionPage + StatisticsPage + SettingsPage
- **`CollapsibleSection.tsx`** — reusable collapse/expand component
- **`TokenUsageBar.tsx`** — weekly token usage visualization
- **`WeeklyUsageChart.tsx`** — 7-day mini bar chart

### Components to Remove
- `DashboardLayout.tsx` (sidebar navigation)
- `DashboardPage.tsx`
- `SubscriptionPage.tsx`
- `StatisticsPage.tsx`
- `SettingsPage.tsx`
- `LoginPage.tsx`
- `RegisterPage.tsx`
- `InstallPage.tsx`
- `HallOfFameCard.tsx`
- `ConnectionStatusCard.tsx` (replaced by inline collapsed section)
- `UpgradePrompt.tsx`
- `DashboardActivity.tsx`
- `UsageChart.tsx` (replaced by TokenUsageBar)
- `AccountOverview.tsx` (replaced by hero card)

### Components to Keep (with style updates)
- `PricingGrid.tsx` — used on landing page and potentially upgrade flow
- `GoogleSignInButton.tsx` — restyled with blue accent
- `AuthContext.tsx` — no changes needed
- `AuthCallbackPage.tsx` — visual refresh only

## Routing Changes (App.tsx)

```
// Before
<Route path="/login" element={<LoginPage />} />
<Route path="/register" element={<RegisterPage />} />
<Route path="/install" element={<InstallPage />} />
<Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
<Route path="/dashboard/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
<Route path="/dashboard/statistics" element={<ProtectedRoute><StatisticsPage /></ProtectedRoute>} />
<Route path="/dashboard/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

// After
<Route path="/login" element={<AuthPage />} />
<Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />

// Redirects for old routes
<Route path="/register" element={<Navigate to="/login" />} />
<Route path="/install" element={<Navigate to="/#install" />} />
<Route path="/dashboard/*" element={<Navigate to="/account" />} />
```

## Token Usage Data

The current system tracks deep/flash mode usage separately (deep mode + flash mode). The new design shows a **unified "Token" usage** — no more flash/deep distinction for the user.

- **Unit:** Abstract "tokens" — the backend already tracks usage counts per day. Map existing `useUsageHistory` daily data to a single unified token count.
- **Reset cadence:** Daily reset (keep existing behavior). The usage bar shows "today" consumption, the 7-day chart shows the week at a glance.
- **Limit:** Derived from tier (free: low limit, Student: medium, Exam Pro: high/unlimited).
- **Over-limit state:** Progress bar turns amber/orange, label changes to "Limit erreicht". No blocking on the frontend — the backend handles rate limiting. The UI just reflects the state.
- **Data source:** Adapt `useQuota` hook to return a single `{ used, limit, remaining }` object instead of separate deep/flash. The `useUsageHistory` hook provides `dailyUsage` array for the 7-day chart.

## Account Page States

### Free Tier (no subscription)
- Plan name: "Starter."
- Price line: "Kostenlos"
- Buttons: "Upgrade" (primary blue) — no "Verwalten" button (nothing to manage)
- Usage bar shows free-tier limit

### Active Subscription (Student / Exam Pro)
- Plan name: "Student." or "Exam Pro."
- Price line: "4,99 € / Monat — verlängert sich am {date}" or "14,99 € / Monat..."
- Buttons: "Upgrade" (if Student) + "Verwalten" (opens Stripe portal)
- Exam Pro shows only "Verwalten" (already highest tier)

### Cancelled Subscription (pending expiry)
- Plan name still shows current tier
- Price line: "Gekündigt — aktiv bis {date}"
- Buttons: "Verwalten" (to reactivate via Stripe portal)
- Subtle amber indicator instead of default blue

### Unlimited (Exam Pro)
- Usage bar hidden or shows "Unbegrenzt" label instead of progress bar
- Week chart still shown for informational purposes

## Auth Page: Link-Code Handling

- `?link={code}` parameter works on **both** tabs (Login and Register)
- When present, after successful login OR registration, redirect to `/auth/callback?link={code}`
- The redirect from `/register` to `/login` **must forward query parameters**: `<Navigate to={"/login" + location.search} />`
- Tab selection is not affected by link-code — user chooses freely

## Redirects

All old routes redirect client-side via React Router `<Navigate>`:
- `/register` → `/login` (with query params forwarded)
- `/install` → `/` (landing page, scroll to install section via anchor or state)
- `/dashboard`, `/dashboard/*` → `/account`

Server-side 301 redirects are not critical — the site is an SPA on Vercel with catch-all routing. Client-side redirects are sufficient.

## Account Deletion Flow

1. User clicks "Permanent löschen" in the Account collapsed section
2. Confirmation modal appears: "Bist du sicher? Dein Account und alle Daten werden permanent gelöscht."
3. User must type "LÖSCHEN" to confirm (destructive action pattern)
4. If email/password account: reauthentication prompt before deletion
5. On success: redirect to `/` landing page

## Transitions & Animations

- **Collapsed sections:** 200ms ease height transition (CSS only, no Framer Motion)
- **Tab switch:** instant swap, no animation (content is simple enough)
- **Page load:** subtle fade-in (opacity 0→1, 300ms) on main content
- **No stagger animations, no spring curves, no glow pulse effects**
- Keep it minimal — the design speaks for itself

## Responsive Behavior

- **Auth page:** Card stays centered, max-width 380px, works on all viewports
- **Account page:** max-width 800px, padding adjusts on mobile (px-4 instead of px-10)
- **Hero card:** Buttons stack vertically on mobile (flex-col below sm breakpoint)
- **Week chart:** Always visible, bars flex to fill width
- **Collapsed sections:** Same behavior on all viewports

## Success Criteria

1. Only 3 routes + callback remain (landing, login, account, auth/callback)
2. All pages use blue (#0a84ff) accent, not teal
3. Anki.plus logo used everywhere
4. Account page loads in single view, no sidebar navigation
5. All existing functionality preserved (Stripe, Firebase auth, link-code flow)
6. Old routes redirect to new ones (with query param forwarding)
7. Design matches landing page aesthetic (font-light, low opacity, minimal)
8. Free tier, active, cancelled, and unlimited states all handled
9. Account deletion requires typed confirmation
