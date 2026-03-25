# Future Ideas

A living document for ambitious ideas that go beyond the current roadmap. Each entry captures the vision, rationale, and key technical considerations — enough to pick up later without losing the original spark.

Ideas here are **not committed to** — they're seeds. Some will grow into specs, others won't. The bar for adding an entry is low: if it made you think "that would be incredible", write it down.

---

## How to Add an Entry

```markdown
### [Idea Title]

**Added:** YYYY-MM-DD
**Status:** Seed | Exploring | Spec'd | In Progress | Shipped | Parked
**Tags:** #plusi #ux #ai #infrastructure #design

**Vision:** What does the world look like when this exists? Describe the experience, not the implementation.

**Why it matters:** What problem does this solve, or what delight does it create?

**Key considerations:**
- Technical feasibility notes
- Dependencies on other systems
- Open questions

**Inspiration:** Links, references, or analogies that capture the feeling.
```

---

## Ideas

### Plusi Spatial Awareness & Autonomous Movement

**Added:** 2026-03-25
**Status:** Seed
**Tags:** #plusi #ux #design #ai

**Vision:** Plusi is not pinned to a corner — it lives in the space. It moves with intention, reacts to what's happening on screen, and develops spatial habits over time. When you're reviewing cards, Plusi drifts toward the reviewer to watch. When you're idle, it explores the empty space or curls up to sleep. When the sidebar opens, it steps aside or peeks in curiously. It remembers where it likes to sit. It feels like sharing a desk with a small, opinionated creature.

**Why it matters:** Right now, Plusi is a fixed-position widget that reacts to events. Making it spatially aware transforms it from a UI element into a companion. The difference between a notification badge and a pet is that the pet moves on its own. Spatial autonomy is what makes Plusi feel *alive* rather than *placed*.

**Key considerations:**
- **Screen zones:** Define attraction points mapped to UI regions (reviewer, chat, sidebar, empty space). Each zone has a "pull" that changes based on what's happening (active review → reviewer zone pulls strongly).
- **Movement physics:** Spring-based interpolation between positions. Plusi never teleports — it always walks/floats/bounces to its destination. Movement speed reflects mood (excited = fast, sleepy = slow drift).
- **Autonomy state machine:** `idle → curious → moving → observing → settling → idle`. Transitions driven by events (card answered, chat message, user inactivity, sidebar opened). Each state has its own behavior loop.
- **Memory:** Persist preferred positions and habits in localStorage. Over time, Plusi develops spatial preferences ("it always sits near the chat when I'm reviewing"). This creates the illusion of personality through spatial behavior.
- **Event-driven awareness:** Plusi subscribes to the event bus. Every significant event (card review, chat message, navigation, sidebar toggle, idle timeout) shifts Plusi's attention vector. Attention → movement → reaction → settle.
- **Technical approach:** Position as `{ x, y }` with spring physics via `requestAnimationFrame`. Attraction points recalculated on events. A `PlusiAutonomy` module (or hook) owns the position logic, separate from MascotShell's rendering.
- **Collision avoidance:** Plusi should never overlap critical UI (input docks, buttons). Define exclusion zones that it routes around.
- **Time awareness:** Factor in session duration and time of day. Morning: more active. Late night: sleepier, slower. Long session: starts suggesting breaks by yawning near the chat.

**Inspiration:** Tamagotchi pets that develop habits. Neko Atsume cats choosing where to sit. The Clippy concept done right — presence without interruption. Studio Ghibli's soot sprites — small creatures that exist in the background of your world and occasionally do something that makes you smile.
