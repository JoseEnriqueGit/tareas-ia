# Design system — Tareas IA

Captured read-only from the project's only design source. Every value below appears in `src/styles.css`; nothing is invented.

## Colors (custom properties)

| Token | Value | Usage | Source |
|---|---|---|---|
| `--primary` | `#2563eb` | Header, primary buttons, active tab, user chat bubble, links, FAB | `src/styles.css` |
| `--danger` | `#dc2626` | Destructive buttons, field errors, high-priority accent | `src/styles.css` |
| `--text` | `#111827` | Body text | `src/styles.css` |
| `--muted` | `#6b7280` | Metadata, empty states, done titles | `src/styles.css` |
| `--border` | `#e5e7eb` | Card, input and tab borders | `src/styles.css` |
| `--bg` | `#f9fafb` | Page background | `src/styles.css` |

## Colors (component literals)

| Token | Value | Usage | Source |
|---|---|---|---|
| `priority-medium` | `#f59e0b` | Medium-priority left accent | `src/styles.css` |
| `priority-low` | `#10b981` | Low-priority left accent | `src/styles.css` |
| `status-progress-bg` | `#dbeafe` | "En progreso" pill background | `src/styles.css` |
| `status-progress-border` | `#93c5fd` | "En progreso" pill border | `src/styles.css` |
| `status-progress-text` | `#1e40af` | "En progreso" pill text | `src/styles.css` |
| `status-done-bg` | `#d1fae5` | "Hecha" pill background | `src/styles.css` |
| `status-done-border` | `#6ee7b7` | "Hecha" pill border | `src/styles.css` |
| `status-done-text` | `#065f46` | "Hecha" pill text | `src/styles.css` |
| `offline-bg` | `#fef3c7` | Offline banner background | `src/styles.css` |
| `offline-text` | `#92400e` | Offline banner text | `src/styles.css` |
| `error-bg` | `#fef2f2` | Error box / delete confirm background | `src/styles.css` |
| `error-border` | `#fecaca` | Error box border | `src/styles.css` |
| `error-text` | `#991b1b` | Error box text | `src/styles.css` |
| `disabled-bg` | `#f3f4f6` | Disabled input background | `src/styles.css` |
| `surface` | `#fff` | Cards, inputs, tabs, chat input bar | `src/styles.css` |

## Typography

| Token | Value | Source |
|---|---|---|
| `font-family` | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | `src/styles.css` |
| `h1` | `1.35rem` | `src/styles.css` |
| `body / inputs` | `16px` (inputs fixed at 16px to avoid iOS zoom) | `src/styles.css` |
| `meta` | `0.82rem` (task meta), `0.75rem` (counts), `0.7rem` (badge) | `src/styles.css` |
| `weights` | `500` labels/nav, `600` buttons/titles | `src/styles.css` |

## Spacing

| Token | Value | Source |
|---|---|---|
| `page-padding` | `1rem` | `src/styles.css` |
| `form-gap` | `0.9rem` | `src/styles.css` |
| `list-gap` | `0.5rem` | `src/styles.css` |
| `content-max` | `640px` | `src/styles.css` |

## Radius

| Token | Value | Source |
|---|---|---|
| `radius` | `8px` | Buttons, inputs, cards, tabs — `src/styles.css` |
| `radius-bubble` | `12px` | Chat bubbles — `src/styles.css` |
| `radius-pill` | `999px` | Status pill, badge — `src/styles.css` |

## Shadows

| Token | Value | Source |
|---|---|---|
| `shadow-fab` | `0 4px 12px #0003` | Floating "+" button — `src/styles.css` |

## Component rules

- Touch targets are at least 44 px tall (buttons, inputs, status pill, tabs, chat links).
- Inputs use `font-size: 16px`.
- Header is `--primary` with white text, sticky, with safe-area top padding.
- Task card: white surface, 1px border, 4px left accent colored by priority.
- Status pill cycles Pendiente → En progreso → Hecha with one tap.
- Errors show next to the field (`.field-error`) or in an `.error-box` with a recovery action.
