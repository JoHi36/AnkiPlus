# Plusi Widget Redesign — Spec

**Date**: 2026-03-19
**Status**: Approved

## Summary

Redesign the PlusiWidget chat component from a broken layout into a self-contained "Mood-Reactive Glow Card" with animated mascot, friendship level system, and distinct visual identity.

## Decisions Made

### Mascot Design
- **Keep current mascot** — friendly blue plus with big eyes and smile
- Works well at 48px dock size, immediately likeable, Duolingo-style motivation
- Personality should match the visual: warm, curious, encouraging (not deadpan/sarcastic)
- Eye wander animation stays

### PlusiWidget Structure

**Glow Card** with three sections:

1. **Header**: 24px animated mascot (mood-expression) + "Plusi" label + mood text + mood dot
2. **Body**: Plusi's response text
3. **Footer**: Friendship level name + delta indicator + progress bar

### Mood-Reactive Colors

The entire card changes color based on mood. All elements (border, glow, plus-icon tint, name color, bar color, delta color) use the same mood color:

| Mood | Color | Hex |
|------|-------|-----|
| neutral | Blue | #0a84ff |
| happy | Green | #34d399 |
| curious | Amber | #f59e0b |
| annoyed | Red | #f87171 |
| sleepy | Grey | #6b7280 |
| excited | Purple | #a78bfa |
| surprised | Amber | #f59e0b |
| blush | Red | #f87171 |
| empathy | Indigo | #818cf8 |
| thinking | Blue | #0a84ff |

Card styling per mood:
- `background: rgba({color}, 0.04)`
- `border: 1px solid rgba({color}, 0.15)`
- `box-shadow: 0 0 16px rgba({color}, 0.07)`

### Font

**Varela Round** for all Plusi widget text (name, response, footer). Same size as regular chat (14px, line-height 1.65). The font creates subtle visual distinction without changing layout proportions.

### Friendship Level System

**AI-driven, not interaction-count-based.** Plusi decides friendship progress via `friendship_delta` in response JSON.

#### Response Format Extension

```json
{
  "mood": "happy",
  "internal": {"energy": 8},
  "friendship_delta": 2
}
```

- `friendship_delta`: integer, range -3 to +3
- Positive: meaningful interaction, user shared something personal, learning milestone
- Zero: small talk, generic greeting (no indicator shown)
- Negative: user was away too long, dismissive, rude

#### Level Thresholds (point-based)

| Level | Name | Points | Bar Color | Plusi's Behavior |
|-------|------|--------|-----------|------------------|
| 1 | Fremde | 0–15 | Mood color | Höflich, vorsichtig, stellt Fragen |
| 2 | Bekannte | 15–50 | Mood color | Lockerer Ton, erste Witze |
| 3 | Freunde | 50–150 | Mood color | Sarkasmus erlaubt, Pushback, Insider |
| 4 | Beste Freunde | 150+ | Mood color + ★ | Komplette Ehrlichkeit, eigene Agenda |

Points cannot go below 0. Max level shows "★ Max" instead of point count.

#### Delta Indicator in Footer

- Positive: `▲ +N` in mood color (e.g., `▲ +2`)
- Negative: `▼ -N` in mood color (e.g., `▼ -1`)
- Zero: no indicator shown

### Header Mascot (24px)

Small animated SVG mascot directly in the widget header. Changes expression per mood:

| Mood | Eyes | Mouth |
|------|------|-------|
| neutral | Normal | Gentle smile |
| happy | Slightly squished | Content smile |
| annoyed | Heavy lids | Flat line |
| curious | Asymmetric (one squinting) | Smirk |
| excited | Wide open | Open O |
| sleepy | Almost shut slits | Slight droop |
| surprised | Tall/wide | Open O |
| blush | Half-lid + blush marks | Wavy |
| empathy | Soft downward | Concerned curve |
| thinking | Looking up-right | Slight frown |

### Dock Mascot Relationship

- Dock mascot (bottom-left, 48px) **mirrors** the mood with full animations
- Widget mascot (24px in header) provides the same mood feedback **at the reading location**
- Dock mascot is supplementary, not required for understanding Plusi's reaction
- Dock mascot can optionally be hidden by user

## What's NOT Changing

- Ephemeral messages: staying as-is for now
- Input field: separate task
- Mascot design: keeping current friendly style
- Backend personality: will be aligned to match friendly visual in a separate task

## Technical Notes

### Files to Modify

- `frontend/src/components/PlusiWidget.jsx` — complete rewrite of the component
- `plusi_agent.py` — add `friendship_delta` to response format and system prompt
- `plusi_storage.py` — add friendship points tracking (separate from interaction count)
- `widget.py` — pass friendship data to frontend in plusi response payload

### Data Flow

1. User sends @Plusi message
2. `plusi_agent.py` generates response with `mood`, `text`, `internal`, `friendship_delta`
3. `plusi_storage.py` updates friendship points, calculates level
4. `widget.py` sends to frontend: `{ mood, text, friendship: { level, levelName, points, maxPoints, delta } }`
5. PlusiWidget renders Glow Card with all data

### Font Loading

Varela Round loaded via Google Fonts CDN (already used pattern in project — Space Grotesk is loaded similarly in current PlusiWidget).
