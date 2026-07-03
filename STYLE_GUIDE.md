# Frontend Style Guide

How we style the OpenShorts dashboard (`dashboard/`). This is the source of truth for
colors, spacing, and component conventions. When you build or change UI, follow it. When
a rule here doesn't fit a real case, update this file in the same PR rather than going
off-pattern silently.

**Stack:** React 18 + Vite + Tailwind CSS 3. No component library (no shadcn/Radix) — we
compose plain elements with Tailwind utility classes.

---

## 1. Principles

- **Light, calm, content-first.** The video and the user's content are the subject; the UI
  is a quiet, low-contrast frame around it. Lots of white, soft borders, restrained shadows.
- **Green is the brand, used sparingly.** Green signals "primary / active / brand." If
  everything is green, nothing is. Most of the UI is neutral (pure grays, ChatGPT-light style); green marks the one thing that
  matters on a screen (primary action, active nav item).
- **Tokens, not raw colors.** Never hardcode `text-zinc-400`, `bg-white/5`, or hex values in
  components. Use the semantic tokens below. This is what makes the theme consistent and a
  future dark mode a one-file change.
- **Surgical and consistent.** Match the patterns already in the codebase. A new card should
  look like every other card.

---

## 2. Design tokens

Tokens are CSS variables defined in `dashboard/src/index.css` (`:root` = light, `.dark` =
dark scaffold) and exposed to Tailwind in `dashboard/tailwind.config.js`. Because they're
defined as HSL channels, **Tailwind opacity modifiers work** (e.g. `bg-primary/15`).

**Surface hierarchy (3 steps).** Depth reads through lightness, not shadow:
**sidebar is the grayest**, the **main canvas is lighter**, and **cards are white** so they
lift off the canvas. (`surface` darker than `background` darker than `card`.) Don't put a
white card on a white surface — it disappears.

| Tailwind class | Token | Use it for |
|---|---|---|
| `bg-surface` | light gray | sidebar & side panels — the **grayest** surface |
| `bg-background` | near-white (above the sidebar in lightness) | the main content canvas, never cards |
| `bg-card` | white | cards, modals, inputs — lifts off the canvas via its border |
| `bg-muted` | subtle gray fill (darker than the sidebar) | hover surfaces, inset wells, secondary fills |
| `text-foreground` | near-black | primary text, headings, body |
| `text-muted-foreground` | mid gray | secondary text, captions, placeholders, inactive icons |
| `border-border` | light divider | all borders and dividers |
| `bg-primary` | **leaf green `#6DB364`** (muted brand green) | primary button bg, active/brand fills |
| `text-primary-foreground` | deep green | text/icons **on** a green (`bg-primary`) surface |
| `bg-primary-hover` | deeper green | primary button `:hover` |
| `text-primary-strong` | readable deep green | green **as text** — links, active nav labels/icons |
| `ring-ring` | green focus | focus rings |

**The single most important color rule:**

> `#6DB364` is a mid-lightness leaf green. It is **never** a body-text color on white and **never**
> carries white text (white on `#6DB364` is ~2.5:1 — fails AA). Green-on-white text fails contrast too.
>
> - Green as a **fill** (button, badge, active pill) → pair with **dark** text
>   (`text-primary-foreground` or `text-foreground`).
> - Green as **text/icon** on white → use **`text-primary-strong`**, never `text-primary`.

Target **WCAG AA** (4.5:1 body, 3:1 large text / UI). When in doubt, darken.

### Adding or changing a token
Change the value in **one place**: the `:root` block in `index.css` (and its `.dark`
counterpart). Don't add new hardcoded colors to components — add a token. The brand green (`#6DB364`, sampled from the logo) lives only in `--primary*` — any future change is a single edit there.

---

## 3. Typography

- **Font:** system sans (Tailwind default stack). Noto Serif (loaded in `index.css`) is
  reserved for hook/caption *preview* rendering, not UI chrome.
- **Hierarchy:**
  - Page title: `text-2xl font-bold text-foreground`
  - Section heading: `text-lg font-semibold text-foreground`
  - Body: `text-sm text-foreground`
  - Secondary / caption: `text-xs text-muted-foreground`
  - Eyebrow/label: `text-xs font-bold uppercase tracking-wider text-muted-foreground`
- Weight carries hierarchy more than size. Don't go above `font-bold`.

---

## 4. Spacing, radius, elevation

- **Spacing:** Tailwind scale. Card padding `p-4`–`p-6`. Stack gaps `space-y-1` (dense lists)
  to `space-y-4` (sections). Page gutters `px-6`.
- **Radius:** `rounded-xl` for cards, panels, buttons, and inputs. `rounded-lg` for small
  controls (chips, segmented buttons). `rounded-full` for avatars/icon badges. Stay
  consistent — don't mix `rounded-md` into a card-heavy view.
- **Elevation (shadows are subtle on light):**
  - Resting card: border only (`border border-border`), no shadow.
  - Raised/floating (dropdown, popover): `shadow-md`.
  - Modal: `shadow-lg` / `shadow-xl`.
  - Avoid heavy/dark glows from the old dark theme (`shadow-2xl shadow-primary/20`). On
    light, depth comes from borders and small shadows, not glow.

---

## 5. Components

### Card
A white surface that groups related content.

```jsx
<div className="bg-card border border-border rounded-xl p-5">…</div>
```

**When to use a card:** to group a discrete, self-contained unit (a result, a settings
group, a stat, a form section) that benefits from a visible boundary.

**When NOT to:** for top-level page layout or to wrap a single line of text. Don't nest a
card directly inside a card — switch the inner grouping to `bg-muted` wells or plain spacing.

**Variants:**
- *Default:* `bg-card border border-border rounded-xl` — resting, no shadow.
- *Interactive* (clickable/hover): add `hover:border-primary/60 transition-colors cursor-pointer`.
  Optionally `hover:shadow-md`.
- *Selected:* `border-primary ring-2 ring-primary/30`.
- *Inset well* (a sub-region inside a card): `bg-muted border border-border rounded-lg p-3`.

### Buttons
- **Primary** (one per view — the main action): green fill, dark text.
  `bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl px-5 py-2.5 font-medium transition-colors` — or use the `.btn-primary` class in `index.css`.
- **Secondary** (supporting action): `bg-card border border-border text-foreground hover:bg-muted rounded-xl px-5 py-2.5`.
- **Ghost** (tertiary / icon buttons / toolbar): `text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg`.
- **Destructive** (delete/irreversible): `bg-red-500 hover:bg-red-600 text-white`. Status
  colors (red/amber/green) stay on the standard Tailwind palette — they read fine on light
  and shouldn't be brand green.

One primary per screen. If you have two "primary-looking" buttons, one of them is secondary.

### Inputs & forms
Use the `.input-field` class (defined in `index.css`):
`bg-card border border-border rounded-xl … focus:border-primary focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground`.
Labels: `text-xs font-bold uppercase tracking-wider text-muted-foreground`. Focus is always
the green ring — don't introduce per-input blue/violet focus colors.

### Badges / pills
Small status/tag chips: `text-xs font-medium px-2 py-0.5 rounded-full`.
- Brand/active: `bg-primary/20 text-primary-strong`.
- Neutral: `bg-muted text-muted-foreground border border-border`.
- Status: tint + **dark ink** of a Tailwind hue, e.g. `bg-green-500/10 text-green-700`,
  `bg-amber-500/10 text-amber-700`, `bg-red-500/10 text-red-700`.

> **Status/warning text must use the dark ink shade (`-700`/`-800`), never the light
> (`-200`/`-400`) shades.** Light status text is a dark-theme idiom — on a pale tint over a
> light background it fails contrast badly (this was the unreadable amber "keys missing"
> warning). Same rule for warning banners: `bg-amber-500/10` → `text-amber-800` body,
> `text-amber-600` icon, `text-amber-700` secondary.

### Segmented / toggle groups
(e.g. Viral clips / Summary reel, Auto / Streamer). Equal-width buttons in a grid:
- Selected: `border-primary bg-primary/10 text-primary-strong`.
- Unselected: `border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground`.

### Navigation (sidebar)
Left sidebar, collapsible (`w-64` ↔ `w-16`, `transition-[width] duration-200`). State persists
in `localStorage` (`aishorts_sidebar_collapsed`); toggle is the `PanelLeft` icon in the header.
- Active item: `bg-primary/20 text-primary-strong`.
- Inactive: `text-foreground/70 hover:text-foreground hover:bg-muted` — nav labels are **dark**,
  not muted gray. Inactive nav is the one place we go darker than `text-muted-foreground`, so
  the items read clearly against the gray sidebar (don't drop nav labels to `muted-foreground`).
- Collapsed: hide labels, center icons, show a hover tooltip (the `tip()` helper — no Radix).
- All nav active states are **unified to the brand green** — no per-tab category colors.

### Modals & overlays
- Backdrop: `fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm` (a dark scrim is correct
  even on a light app — it focuses attention).
- Panel: `bg-card border border-border rounded-2xl shadow-xl`.

### Media surfaces
Video players, thumbnails, and frame previews sit on **black** (`bg-black` / `bg-zinc-900`)
on purpose — video reads best on black. Don't "lighten" these.

---

## 6. States

Every interactive element needs visible states:
- **Hover:** lighten/darken one step — `hover:bg-muted`, `hover:text-foreground`, `hover:border-primary/60`.
- **Focus:** `focus:outline-none focus:ring-1 focus:ring-ring` (mint). Keyboard users must
  see focus — never remove it without a replacement.
- **Active/pressed:** `active:scale-[0.98]` for buttons.
- **Disabled:** `disabled:opacity-50 disabled:cursor-not-allowed`.
- **Selected:** mint border + ring, as above.

---

## 7. Do / Don't

**Do**
- Use semantic token classes (`text-foreground`, `bg-muted`, `border-border`, `bg-primary`).
- Keep one primary action per screen.
- Reach for `bg-muted` wells instead of nested cards.
- Use `text-primary-strong` whenever green needs to be *readable text*.

**Don't**
- Hardcode `text-white`, `text-zinc-*`, `bg-white/x`, `border-white/x`, or hex colors in
  components. (These were the dark-theme idiom; they're gone.)
- Put `text-primary` (raw green) on a white background.
- Add per-component accent colors (violet/blue/emerald) for brand emphasis — that's the brand green's job.
- Stack heavy dark shadows/glows; light depth is borders + small shadows.
