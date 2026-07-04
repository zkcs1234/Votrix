# VOTRIX UI design system

Professional, minimal SaaS dashboard — monochrome palette, Inter typography, VOTRIX logo branding.

## Brand

- Logo: `src/assets/logo/votrix-logo.svg` (mark + wordmark), `votrix-mark.svg` (icon only)
- Component: `src/components/brand/VotrixLogo.jsx` — uses inline SVG via `VotrixMark.jsx`, adapts with `currentColor` (`text-v-text` on light, `text-white` on sidebar)
- Component: `VotrixLogo` — use on login, sidebar, loaders
- Tagline: **Every Vote Counts.**

## Color palette

| Token | Light | Usage |
|-------|-------|--------|
| `--v-bg` | `#F3F4F6` | Page background |
| `--v-surface` | `#FFFFFF` | Cards, header |
| `--v-text` | `#111827` | Headings, body |
| `--v-text-muted` | `#374151` | Labels |
| `--v-text-subtle` | `#6B7280` | Hints |
| `--v-sidebar` | `#111827` | Fixed dark sidebar |
| `--v-primary` | `#111827` | Primary buttons |

Success / danger / warning use muted green, red, amber only.

## Components (`@/modules/ui`)

| Component | Use |
|-----------|-----|
| `VotrixLogo` | Branding |
| `Button` | Primary (charcoal), secondary, ghost, danger |
| `Input` / `PasswordInput` | Forms with show-password |
| `Card` / `StatCard` | Dashboard panels |
| `Badge` | Status labels |
| `Table` | Data tables |
| `PageHeader` | Page title + actions |
| `LoginForm` | Shared auth layout |

## Layout

- **AppShell** — dark sidebar `#111827`, light content area, user avatar in header
- **AuthLayout** — centered card on `#F3F4F6`, logo + tagline
- **MainLayout** — public home with clean header/footer

## Theme

- Default: **light** (professional SaaS)
- Dark mode: charcoal backgrounds, toggle in header
- Legacy `bg-slate-*` / `text-indigo-*` classes remap to neutral tokens via `index.css`

## CSS utilities

- `.v-card` — elevated card
- `.v-input` — form input
- `.v-table` / `.v-table-wrap` — table styling

Refresh the browser after pulling changes. Clear `localStorage` key `votrix_theme` if colors look wrong.
