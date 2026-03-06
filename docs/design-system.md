# Greenhouse SaaS — Design System

**Sprint 30 — Design System & UI/UX Foundation**

---

## Color Tokens

### Dark Mode Palette

| Token | Value | Usage |
|---|---|---|
| `bg-dark` | `#0b0f12` | Main page background |
| `surface-dark` | `#111720` | Card / panel background |
| `surface2-dark` | `#1a2232` | Elevated surfaces |
| `primary` | `#00ff9c` | Active elements, CTAs, live indicators |
| `secondary` | `#00d9ff` | Info data, live feed, secondary accents |
| `accent` | `#2dbf7f` | Positive trends, success states |
| `warning` | `#ffb300` | Degraded states, threshold warnings |
| `danger` | `#ff4d4f` | Critical alerts, offline states, errors |

### Light Mode Palette

| Token | Value | Usage |
|---|---|---|
| `bg-light` | `#f6f8f9` | Main page background |
| `surface-light` | `#edf0f2` | Card / panel background |
| `primary-light` | `#1e7f5c` | Active elements, CTAs |
| `accent-light` | `#2dbf7f` | Positive trends, success |

### CSS Variables (Tailwind v4 `@theme`)

All tokens are also available as Tailwind utilities via `--color-gh-*` variables defined in `src/index.css`.

---

## DaisyUI Themes

Two custom DaisyUI themes are configured via `@plugin "daisyui/theme"` in `src/index.css`:

- **`greenhouse-dark`** — Dark mode theme with neon green primary and cyan secondary
- **`greenhouse-light`** — Light mode theme with forest green primary

To activate: set the `data-theme` attribute on `<html>` or use the `dark` class (Tailwind dark mode variant is already configured).

---

## Visual Effects

### Glassmorphism

Available CSS utility classes:

```css
.glass          /* Neutral — works on both dark/light */
.glass-light    /* Light glassmorphism (white tinted) */
.glass-dark     /* Dark glassmorphism (#0b0f12 tinted) */
```

Usage example:
```tsx
<div className="glass rounded-xl p-4">...</div>
```

### Glow Borders

```css
.glow-green         /* Static neon green glow */
.glow-green-hover   /* Glow intensifies on :hover */
.glow-cyan          /* Static cyan glow */
.glow-cyan-hover    /* Cyan glow on hover */
.glow-warning       /* Amber glow */
.glow-danger        /* Red glow */
.glow-active        /* Pulsing animated green glow (for live zones) */
```

### Gradient Blur Backgrounds

Apply to a page container to add ambient neon color blobs:

```tsx
<div className="gradient-blur-primary gradient-blur-secondary">
  {/* page content */}
</div>
```

- `gradient-blur-primary` — top-right green blob (`::before`)
- `gradient-blur-secondary` — bottom-left cyan blob (`::after`)

---

## Components

### `<GlowCard />`

Card with animated neon glow border and optional glassmorphism background.

```tsx
import { GlowCard } from "@/components/ui/GlowCard";

<GlowCard variant="green" active glass className="p-5">
  Content here
</GlowCard>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `"green" \| "cyan" \| "warning" \| "danger" \| "none"` | `"green"` | Glow color |
| `active` | `boolean` | `false` | Continuous pulse glow |
| `glass` | `boolean` | `false` | Glassmorphism background |
| `onClick` | `() => void` | — | Makes card interactive |
| `className` | `string` | — | Extra Tailwind classes |

---

### `<MetricTile />`

Compact metric display with value, unit, trend indicator and optional sparkline.

```tsx
import { MetricTile } from "@/components/ui/MetricTile";

<MetricTile
  label="Température Moy."
  value={23.5}
  unit="°C"
  trend="up"
  trendPercent={2.3}
  sparkline={readings}
  color="green"
/>
```

**Props:**

| Prop | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | required | Display label |
| `value` | `number \| string` | required | Current value |
| `unit` | `string` | — | Unit suffix |
| `trend` | `"up" \| "down" \| "flat"` | `"flat"` | Trend direction |
| `trendPercent` | `number` | — | % change |
| `sparkline` | `SparkPoint[]` | — | Mini chart data |
| `color` | `"green" \| "cyan" \| "warning" \| "danger" \| "neutral"` | `"green"` | Value color |

---

### `<LiveIndicator />`

Pulsing dot reflecting live connection state. Fires a burst animation on new readings.

```tsx
import { LiveIndicator } from "@/components/ui/LiveIndicator";

<LiveIndicator
  state="live"           // "live" | "offline" | "degraded"
  readingTimestamp={ts}  // changes trigger a pulse burst
  size="md"              // "sm" | "md" | "lg"
  label="MQTT connected"
/>
```

**Animation:** CSS `animate-live-pulse` — GPU transform only, respects `prefers-reduced-motion`.

---

### `<ZoneStatusBadge />`

Colored badge for zone state with built-in LiveIndicator.

```tsx
import { ZoneStatusBadge } from "@/components/ui/ZoneStatusBadge";

<ZoneStatusBadge state="online" />
// or "offline" | "alert" | "syncing"
```

States → colors:
- `online` → neon green glow + "Online"
- `offline` → red + "Offline"
- `alert` → amber pulse + "Alert"
- `syncing` → cyan + "Syncing"

---

### `<AutomationChip />`

Compact chip displaying an active automation rule. Click triggers ripple animation.

```tsx
import { AutomationChip } from "@/components/ui/AutomationChip";

<AutomationChip
  name="High Temp → Fan ON"
  active
  triggerCount={12}
  onClick={() => navigate('/automations')}
/>
```

**Micro-animation:** Framer Motion ripple on click (respects `prefers-reduced-motion`).

---

### `<CommandButton />`

ON/OFF actuator button with 3-state feedback animation.

```tsx
import { CommandButton } from "@/components/ui/CommandButton";

<CommandButton
  isOn={actuator.state}
  name="Irrigation Pump"
  commandState={command?.status}  // "pending" | "ack" | "failed" | "idle"
  onToggle={async () => {
    await sendCommand(actuator.id, { command_type: isOn ? "OFF" : "ON" });
  }}
/>
```

**States:**
- `idle` → normal ON/OFF button
- `pending` → Loader spinner + progress bar + `animate-command-pulse`
- `ack` → CheckCircle green flash (1.5s)
- `failed` → XCircle red flash (3s), reverts to idle

---

### `<SensorChart />`

Standardized Recharts line chart with dark/light theming and lazy viewport rendering.

```tsx
import { SensorChart } from "@/components/ui/SensorChart";

<SensorChart
  data={readings}               // { received_at: string; value: number }[]
  sensorType="TEMP"             // for auto color + label
  unit="°C"
  minThreshold={10}
  maxThreshold={35}
  height={160}
  aria-label="Zone A temperature over time"
/>
```

**Performance:** Uses `IntersectionObserver` — chart is not rendered until it enters the viewport. Skeleton shown while off-screen.

**Sensor type colors:**

| Type | Color |
|---|---|
| `TEMP` | `#ff7c52` (orange) |
| `HUM_AIR` | `#00d9ff` (cyan) |
| `HUM_SOIL` | `#2dbf7f` (green) |
| `PH` | `#a78bfa` (purple) |
| `LIGHT` | `#ffb300` (amber) |
| `CO2` | `#6b7280` (grey) |

---

## Micro-Animations

All animations are defined as pure CSS keyframes in `src/index.css`. No JS runtime overhead for visual effects.

| Class | Trigger | Description |
|---|---|---|
| `.animate-live-pulse` | Continuous | Pulsing ring on `LiveIndicator` for live state |
| `.animate-ripple` | On click | Ripple burst for `AutomationChip` |
| `.animate-command-pulse` | While pending | Opacity pulse on `CommandButton` + `ZoneStatusBadge[alert]` |
| `.animate-confetti` | On ack | Scale+rotate burst for acknowledged alerts |
| `.glow-active` | Continuous | Neon green box-shadow pulse on active zone cards |

All animations include a `@media (prefers-reduced-motion: reduce)` block that disables them.

---

## Dashboard Layout (Sprint 30 Signature)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: Title + Add Greenhouse button                                │
├──────────────────┬────────────────┬─────────────────┬──────────────┤
│ BLOCK 1 — GLOBAL OVERVIEW (4 MetricTile GlowCards in a row)         │
│ 🌿 Greenhouses   │ 💧 Zones       │ 📡 Online       │ 🔔 Alerts   │
├──────────────────────────────────┬──────────────────────────────────┤
│ BLOCK 2 — ZONES GRID (3/4)       │ SIDEBAR (1/4)                   │
│                                  │ BLOCK 3 — LIVE FEED             │
│  [Greenhouse A]                  │   ┌──────────────────┐          │
│   ┌────┐ ┌────┐ ┌────┐          │   │ • Zone A / TEMP  │          │
│   │Zone│ │Zone│ │Zone│          │   │ • Zone B / HUM   │          │
│   │GlowCard│                    │   └──────────────────┘          │
│  [Greenhouse B]                  │ BLOCK 4 — RECENT ALERTS         │
│   ┌────┐ ┌────┐                 │   ┌──────────────────┐          │
│   │Zone│ │Zone│                 │   │ ⚠ HIGH | message │ [Ack]   │
│   │    │ │    │                 │   └──────────────────┘          │
└──────────────────────────────────┴──────────────────────────────────┘
```

---

## Performance Guidelines

1. **GPU animations only** — All motion effects use `transform` and `opacity` (CSS GPU layers).
2. **No JS for visual effects** — Glassmorphism, glow, gradient blurs are pure CSS.
3. **Lazy SensorChart** — `IntersectionObserver` prevents off-viewport Recharts renders.
4. **`prefers-reduced-motion`** — All animations disabled for users with vestibular disorders.
5. **Code splitting** — `framer-motion` and `recharts` in separate Vite manual chunks (see `vite.config.ts`).

---

## Icon Standards (Lucide React)

| Context | Icon | Import |
|---|---|---|
| Temperature sensor | `Thermometer` | `lucide-react` |
| Humidity sensor | `Droplets` | `lucide-react` |
| Online zone | `Wifi` | `lucide-react` |
| Offline zone | `WifiOff` | `lucide-react` |
| Alerts / bell | `BellRing` | `lucide-react` |
| Automation | `Zap` | `lucide-react` |
| Command ON | `Power` | `lucide-react` |
| Command OFF | `PowerOff` | `lucide-react` |
| Loading | `Loader2` | `lucide-react` |
| Success | `CheckCircle` | `lucide-react` |
| Failure | `XCircle` | `lucide-react` |
| Edit | `Pencil` | `lucide-react` |
| Delete | `Trash2` | `lucide-react` |
| Add | `Plus` | `lucide-react` |
| Trend up | `TrendingUp` | `lucide-react` |
| Trend down | `TrendingDown` | `lucide-react` |

---

*Last updated: Sprint 30*
