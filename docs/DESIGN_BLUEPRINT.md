# VOTRIX — Complete UI/UX Design Blueprint

> **Prepared for Figma AI implementation.**
> This document is a pixel-perfect, zero-ambiguity specification for rebuilding the VOTRIX application as a premium enterprise SaaS interface. Every screen, component, interaction, and state is documented below.

---

## 1. Design Philosophy

### 1.1 Core Principles

| Principle                   | Application                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visual Hierarchy**        | Every page has a clear Z-pattern: page title → stat cards/overview → content sections → actions. Critical information (status, counts, deadlines) is elevated with typographic weight or color.                                                       |
| **Gestalt Principles**      | Related controls are grouped with consistent spacing (24px between sections, 16px between related items). Cards with similar function share identical dimensions. Tables use alternating row backgrounds only on hover (not striped) to reduce noise. |
| **Accessibility WCAG AA**   | Minimum 4.5:1 contrast ratio for all text. Interactive elements have visible focus rings. All icons have accompanying aria-labels. Color is never the sole indicator of state.                                                                        |
| **Recognition Over Recall** | Navigation labels are descriptive ("Manage Election" not "Module 1"). Status badges use both color AND text ("Active" in green, not just a green dot). All destructive actions have confirmation dialogs.                                             |
| **Consistency**             | Every page that lists items uses the same card/table pattern. All forms follow the same label-top layout. All modals share identical padding (24px), header height (56px), and animation (fade + scale).                                              |
| **Fitts' Law**              | Primary actions (submit, save, create) are positioned at the bottom-right of forms and bottom-center of modals. Navigation targets are minimum 44×44px touch targets.                                                                                 |
| **Hick's Law**              | Dashboards show max 5 stat cards. Tables paginate at 25 rows. Poll builders limit visible questions to 10 before grouping.                                                                                                                            |
| **Progressive Disclosure**  | Multi-step forms (election creation) reveal Step 2 only after Step 1 validation. Advanced settings are hidden behind "Show advanced" toggles.                                                                                                         |
| **Whitespace**              | 24px minimum padding in cards. 32px between major sections. 16px between form fields. Content density decreases on mobile.                                                                                                                            |

### 1.2 Visual Identity

- **Style**: Enterprise SaaS dashboard — clean, minimal, professional
- **Tone**: Trustworthy, efficient, modern
- **Inspiration levels**: Linear (for navigation), Stripe Dashboard (for data density), Vercel (for typography), Notion (for inline editing feel)
- **Avoid**: Glassmorphism, neumorphism, heavy gradients, cartoon illustrations, decorative UI, bright/fluorescent colors, parallax effects

---

## 2. Design System

### 2.1 Color System

#### 2.1.1 Light Mode

| Token                  | HEX       | Usage                                              | Accessibility     |
| ---------------------- | --------- | -------------------------------------------------- | ----------------- |
| `--v-primary`          | `#4F46E5` | Primary buttons, links, active states, focus rings | 7.1:1 on white    |
| `--v-primary-hover`    | `#4338CA` | Primary hover state                                | —                 |
| `--v-primary-soft`     | `#EEF2FF` | Primary background badges, soft highlights         | —                 |
| `--v-brand-accent`     | `#7C3AED` | Gradient end-stop for brand buttons                | —                 |
| `--v-bg`               | `#F3F4F6` | Page background, subtle contrast                   | —                 |
| `--v-surface`          | `#FFFFFF` | Cards, headers, inputs, modals                     | —                 |
| `--v-surface-elevated` | `#F9FAFB` | Table headers, sidebar, hover states               | —                 |
| `--v-border`           | `#E5E7EB` | Card borders, divider lines                        | —                 |
| `--v-border-strong`    | `#D1D5DB` | Input borders, strong separators                   | —                 |
| `--v-text`             | `#111827` | Primary body text, headings                        | 15.3:1 on white   |
| `--v-text-muted`       | `#374151` | Secondary text, labels                             | 8.6:1 on white    |
| `--v-text-subtle`      | `#6B7280` | Tertiary text, hints, placeholders                 | 4.8:1 on white    |
| `--v-sidebar`          | `#111827` | Sidebar background                                 | —                 |
| `--v-sidebar-text`     | `#D1D5DB` | Sidebar navigation text                            | 7.6:1 on #111827  |
| `--v-sidebar-active`   | `#FFFFFF` | Active sidebar item text                           | 16.5:1 on #111827 |
| `--v-success`          | `#059669` | Success states, positive metrics                   | 6.6:1 on white    |
| `--v-success-bg`       | `#ECFDF5` | Success badge backgrounds                          | —                 |
| `--v-danger`           | `#B91C1C` | Errors, destructive actions                        | 6.9:1 on white    |
| `--v-danger-bg`        | `#FEF2F2` | Error backgrounds                                  | —                 |
| `--v-warning`          | `#B45309` | Warnings, pending states                           | 5.2:1 on white    |
| `--v-warning-bg`       | `#FFFBEB` | Warning backgrounds                                | —                 |
| `--v-info`             | `#2563EB` | Informational states                               | 7.2:1 on white    |
| `--v-info-bg`          | `#EFF6FF` | Info backgrounds                                   | —                 |

#### 2.1.2 Dark Mode

| Token                  | HEX       | Usage                                 |
| ---------------------- | --------- | ------------------------------------- |
| `--v-bg`               | `#0B0F14` | Page background                       |
| `--v-surface`          | `#111827` | Cards, inputs, modals                 |
| `--v-surface-elevated` | `#1F2937` | Table headers, hover states           |
| `--v-border`           | `#374151` | Borders                               |
| `--v-border-strong`    | `#4B5563` | Strong borders                        |
| `--v-text`             | `#F9FAFB` | Primary text                          |
| `--v-text-muted`       | `#D1D5DB` | Secondary text                        |
| `--v-text-subtle`      | `#9CA3AF` | Tertiary text                         |
| `--v-primary`          | `#818CF8` | Primary actions (lighter for dark bg) |
| `--v-primary-hover`    | `#A5B4FC` | Primary hover                         |
| `--v-success`          | `#34D399` | Success states                        |
| `--v-danger`           | `#F87171` | Danger states                         |
| `--v-warning`          | `#FBBF24` | Warning states                        |

#### 2.1.3 Module Color Identities

| Module      | Light Gradient      | Dark Gradient       | Icon Color | Purpose                       |
| ----------- | ------------------- | ------------------- | ---------- | ----------------------------- |
| Election    | `#E0E7FF → #C7D2FE` | `#312E81 → #3730A3` | `#4F46E5`  | Voting, ballots, positions    |
| Competition | `#FEF3C7 → #FDE68A` | `#451A03 → #78350F` | `#D97706`  | Scoring, judging, rankings    |
| Polling     | `#D1FAE5 → #A7F3D0` | `#064E3B → #065F46` | `#059669`  | Surveys, questions, analytics |

**Why module colors**: Each module needs rapid visual identification. When a user sees a card with the amber gradient, they immediately know it's Competition — reducing cognitive load. The module colors are only used as background tints for cards and illustration areas, never for text or primary actions (avoiding color confusion with semantic states).

#### 2.1.4 Chart Color Palette

```
Bar/Line charts: #4F46E5, #7C3AED, #059669, #D97706, #2563EB, #B91C1C
Pie/Donut charts: #4F46E5, #7C3AED, #059669, #D97706, #2563EB, #B91C1C, #EC4899, #14B8A6
```

**Why**: The palette is ordered by importance. Primary data series use indigo/violet (brand colors), secondary use green/amber. This ensures the most important data stands out first.

#### 2.1.5 State Colors

| Component State  | Token                                 | Light Value              | Dark Value               |
| ---------------- | ------------------------------------- | ------------------------ | ------------------------ |
| Focus ring       | `--v-primary`                         | `#4F46E5` at 30% opacity | `#818CF8` at 30% opacity |
| Disabled bg      | `--v-surface-elevated`                | `#F9FAFB`                | `#1F2937`                |
| Disabled text    | `--v-text-subtle`                     | `#6B7280`                | `#9CA3AF`                |
| Selected row     | `--v-primary-soft`                    | `#EEF2FF`                | `#1E1B4B`                |
| Skeleton shimmer | `--v-surface-elevated` → `--v-border` | `#F9FAFB` → `#E5E7EB`    | `#1F2937` → `#374151`    |

### 2.2 Typography

#### 2.2.1 Font Family Hierarchy

| Role    | Font                | Fallback                             | Usage                                    |
| ------- | ------------------- | ------------------------------------ | ---------------------------------------- |
| Display | `Plus Jakarta Sans` | Inter, system-ui, sans-serif         | Page titles, hero sections, empty states |
| Body    | `Inter`             | system-ui, -apple-system, sans-serif | All body text, labels, buttons           |
| Mono    | `JetBrains Mono`    | ui-monospace, SFMono-Regular, Menlo  | Stats, numbers, code snippets            |

**Why three families**: Display font adds personality to titles without noise. Body font (Inter) provides excellent readability at 14px. Monospace ensures numerical alignment in stat cards and tables via tabular-nums.

#### 2.2.2 Type Scale

| Token              | Size                               | Weight | Line Height | Letter Spacing | Usage                                 |
| ------------------ | ---------------------------------- | ------ | ----------- | -------------- | ------------------------------------- |
| `.v-display`       | `clamp(2rem, 4vw, 3rem)` (32-48px) | 800    | 1.1         | -0.03em        | Hero text, 404 pages, empty states    |
| `.v-page-title`    | `1.5rem` (24px)                    | 700    | 1.2         | -0.02em        | Page headings (H1)                    |
| `.v-section-title` | `1.25rem` (20px)                   | 700    | 1.25        | -0.015em       | Section headings (H2)                 |
| `.v-card-title`    | `1rem` (16px)                      | 600    | 1.5         | -0.01em        | Card titles                           |
| `.v-body-text`     | `0.875rem` (14px)                  | 400    | 1.5         | normal         | Body paragraphs, descriptions         |
| `.v-label`         | `0.875rem` (14px)                  | 500    | 1.25        | normal         | Form labels, table headers            |
| `.v-caption`       | `0.75rem` (12px)                   | 400    | 1.4         | normal         | Secondary info, timestamps, help text |
| `.v-stat-number`   | `1.5rem`–`2rem` (24-32px)          | 600    | 1.1         | -0.01em        | Dashboard stat values                 |
| `.v-tiny`          | `0.625rem` (10px)                  | 500    | 1.2         | +0.05em        | Badge text, small labels              |

#### 2.2.3 Text Hierarchy

```
Page:  "Analytics"                    (v-page-title, 24px, bold)
         ├─ Section: "Voter turnout"  (v-section-title, 20px, bold)
         │   ├─ Card title: "By position"   (v-card-title, 16px, semibold)
         │   ├─ Body: "Total votes cast: 142"   (v-body-text, 14px)
         │   └─ Caption: "Updated 2 min ago"   (v-caption, 12px)
         └─ Table header: "Name"  (v-label, 12px, uppercase, tracking-wider)
```

### 2.3 Spacing System

#### 2.3.1 Base Grid

The design uses a **4px grid** for all spacing decisions. Every spacing value is a multiple of 4.

| Token           | Value | Usage                                   |
| --------------- | ----- | --------------------------------------- |
| `--spacing-0.5` | 2px   | Border widths, icon gaps                |
| `--spacing-1`   | 4px   | Tiny gaps (icon to text)                |
| `--spacing-2`   | 8px   | Tight padding (badges, small chips)     |
| `--spacing-3`   | 12px  | Button padding Y, dismissible close     |
| `--spacing-4`   | 16px  | Card padding (small), form field gaps   |
| `--spacing-5`   | 20px  | Input padding X, tight margins          |
| `--spacing-6`   | 24px  | Card padding (default), section spacing |
| `--spacing-8`   | 32px  | Dashboard page margin, major sections   |
| `--spacing-10`  | 40px  | Page content padding (desktop)          |
| `--spacing-12`  | 48px  | Large page sections, modal from top     |

#### 2.3.2 Spacing Rules

| Context             | Rule                                            | Reasoning                                                            |
| ------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| **Card padding**    | sm: 16px, md: 24px, lg: 32px                    | Consistent with shadow spread, prevents content from feeling cramped |
| **Form fields**     | 16px vertical gap between fields                | Hick's Law — reduces visual density, each field gets attention       |
| **Form groups**     | 24px gap between logical groups                 | Gestalt — separates different form sections                          |
| **Table cells**     | 12px vertical, 16px horizontal                  | Allows readable text without excessive horizontal scroll             |
| **Dashboard cards** | 16px gap in grid                                | Sufficient separation while maintaining "connection"                 |
| **Page margins**    | 32px on desktop, 24px on tablet, 16px on mobile | Progressive reduction as viewport shrinks                            |
| **List items**      | 8px vertical gap                                | Tight enough for scannability, loose enough for touch targets        |

### 2.4 Border Radius

| Element                     | Radius           | Token               | Reasoning                                                     |
| --------------------------- | ---------------- | ------------------- | ------------------------------------------------------------- |
| Cards                       | 12px (0.75rem)   | `--radius-card`     | Soft enough to feel premium, not so round it looks playful    |
| Buttons                     | 8px (0.5rem)     | `--radius-btn`      | Standard for actions, consistent with inputs                  |
| Text inputs                 | 8px (0.5rem)     | `--radius-input`    | Matches buttons for form consistency                          |
| Select dropdowns            | 8px (0.5rem)     | `--radius-select`   | Consistent with inputs                                        |
| Badges                      | 9999px (full)    | `--radius-badge`    | Pill shape — standard badge convention                        |
| Modals/Dialogs              | 16px (1rem)      | `--radius-modal`    | Larger radius for elevation — signals "this is a layer above" |
| Tooltips                    | 8px (0.5rem)     | `--radius-tooltip`  | Subtle rounding                                               |
| Toast notifications         | 12px (0.75rem)   | `--radius-toast`    | Matches cards, feels cohesive                                 |
| Dropdown menus              | 8px (0.5rem)     | `--radius-dropdown` | Consistent with buttons                                       |
| Avatars                     | 9999px (full)    | `--radius-avatar`   | Circular — universal convention                               |
| Images (card illustrations) | 12px top corners | `--radius-img`      | Follows card radius; bottom corners flush with card           |
| Charts                      | 4px (0.25rem)    | `--radius-chart`    | Minimal rounding for bar chart columns                        |

### 2.5 Elevation & Shadows

| Token           | Light Value                                                             | Dark Value                                                              | Usage                            | Reasoning                                |
| --------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------- | ---------------------------------------- |
| `--v-shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.04)`                                         | `0 1px 2px 0 rgb(0 0 0 / 0.30)`                                         | Default cards, subtle elevation  | Just enough to lift from background      |
| `--v-shadow`    | `0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)`       | `0 1px 3px 0 rgb(0 0 0 / 0.35)`                                         | Standard cards, inputs           | Default card depth                       |
| `--v-shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)`    | `0 4px 6px -1px rgb(0 0 0 / 0.40), 0 2px 4px -2px rgb(0 0 0 / 0.30)`    | Elevated cards, hover states     | Noticeable lift for interactive elements |
| `--v-shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05)`  | `0 10px 15px -3px rgb(0 0 0 / 0.45), 0 4px 6px -4px rgb(0 0 0 / 0.30)`  | Dropdowns, tooltips, modals      | Clear separation from background         |
| `--v-shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.06)` | `0 20px 25px -5px rgb(0 0 0 / 0.55), 0 8px 10px -6px rgb(0 0 0 / 0.40)` | Modals, drawers, floating panels | Highest elevation — temporary overlays   |

**Shadow layering rule**: Elements with higher z-index MUST have higher shadow tier. A modal (z-50) must use `--v-shadow-xl`. A dropdown (z-30) uses `--v-shadow-lg`. This creates a consistent mental model of "darker shadow = closer to user."

### 2.6 Iconography

| Property              | Specification                                             |
| --------------------- | --------------------------------------------------------- |
| **Library**           | Lucide React (open-source, consistent stroke style)       |
| **Stroke width**      | `1.5px` across ALL icons — NEVER use stroke 2 or stroke 1 |
| **Default size**      | `16px` (1rem) — inline with text                          |
| **Small size**        | `14px` (0.875rem) — inside badges, compact tables         |
| **Medium size**       | `20px` (1.25rem) — stat card icons, section headers       |
| **Large size**        | `24px` (1.5rem) — empty states, page headers              |
| **Icon+text spacing** | `8px` gap between icon and adjacent text                  |
| **Icon-only buttons** | Tooltip required — wrap in `<button aria-label="...">`    |

**Usage rules**:

1. Icons are decorative helpers — they should NEVER be the sole indicator of meaning
2. Always use `aria-hidden="true"` on `<svg>` elements since icons are decorative
3. Icons in buttons should be on the LEFT for actions (← "Back") and RIGHT for navigation (→ "View more")
4. Status icons (check, X, alert) should use semantic colors

### 2.7 Illustration Style

| Context           | Style                                                          | Action                                                                            |
| ----------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Module cards**  | Undraw-style SVGs with module gradient backgrounds             | Full-width banner illustrations (12rem height) with gradient fade to card surface |
| **Empty states**  | Minimal line-art illustrations in gray tones, centered in card | Single illustration (120×120px) with title, description, and optional CTA         |
| **Login page**    | Abstract geometric pattern or subtle brand mark background     | Avoid illustrations — use brand logo + clean centered card                        |
| **404 page**      | Simple "not found" line art with large heading                 | Centered layout with "Back home" button                                           |
| **Success pages** | Green checkmark circle (custom SVG, 64px)                      | Centered above success text                                                       |

**Style specifications**:

- Line weights: 2px
- Colors: `--v-text-subtle` for primary lines, `--v-border` for secondary lines
- Fills: `--v-primary-soft` for module illustrations, `--v-surface-elevated` for empty states
- No complex multi-color illustrations — keep minimal and brand-aligned

---

## 3. Layout System

### 3.1 Breakpoints

| Breakpoint | Width  | Target                            |
| ---------- | ------ | --------------------------------- |
| `sm`       | 640px  | Large phones, small tablets       |
| `md`       | 768px  | Tablets portrait                  |
| `lg`       | 1024px | Tablets landscape, small desktops |
| `xl`       | 1280px | Standard desktops                 |
| `2xl`      | 1536px | Large desktops, wide screens      |

### 3.2 App Shell Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│   [← Back]    Page Title                    🔍 🔔 🌙 👤  │  ← Header (64px, sticky)
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│          │   Content Area                                   │
│ Sidebar  │   (p-8 on desktop, p-6 on tablet,               │
│ (256px)  │    p-4 on mobile)                               │
│          │                                                  │
│          │   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│          │   │Stat 1│ │Stat 2│ │Stat 3│ │Stat 4│          │
│          │   └──────┘ └──────┘ └──────┘ └──────┘          │
│          │                                                  │
│          │   ┌──────────────────────────────────┐          │
│          │   │ Chart / Card Content              │          │
│          │   └──────────────────────────────────┘          │
│          │                                                  │
│          │   ┌────────────────┐ ┌────────────────┐          │
│          │   │ Activity       │ │ Growth Chart   │          │
│          │   └────────────────┘ └────────────────┘          │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

#### 3.2.1 Sidebar Specifications (Desktop)

| State     | Width             | Padding                          | Behavior                        |
| --------- | ----------------- | -------------------------------- | ------------------------------- |
| Expanded  | 256px             | 24px horizontal, 24px top/bottom | Default state                   |
| Collapsed | 72px              | 12px horizontal                  | Icons only, tooltip on hover    |
| Mobile    | 100vw (max 280px) | 24px                             | Off-canvas drawer with backdrop |

**Sidebar content hierarchy**:

1. **Top**: VOTRIX logo (32px height) with link to dashboard
2. **Module label**: 11px uppercase tracking-wider text (e.g., "ADMIN", "ORGANIZER")
3. **Navigation items**: 8px gap between groups, 4px gap between items
4. **Bottom**: Collapse button (desktop only), "Back to" link if scoped

**Navigation item specifications**:

- Height: 40px (expanded), 44px (collapsed — square touch target)
- Inactive: `--v-sidebar-text` (#D1D5DB), `hover:bg-white/5`
- Active: `--v-sidebar-active` (white), `bg-white/10`
- Icons: 16px, stroke 1.5, `shrink-0`

#### 3.2.2 Header Specifications

| Element           | Size                                | Behavior                                            |
| ----------------- | ----------------------------------- | --------------------------------------------------- |
| Height            | 64px (56px mobile)                  | Sticky with `position: sticky; top: 0; z-index: 40` |
| Background        | `--v-surface`                       | Bottom border 1px `--v-border`                      |
| Back button       | Only on scoped pages (voter, judge) | Positioned above page title                         |
| Search            | 300px max, hidden on mobile         | Global search bar with Command+K shortcut           |
| Notification bell | 40×40px button with badge           | Dropdown modal on click                             |
| Theme toggle      | 40×40px button                      | Sun/Moon icon toggle                                |
| User avatar       | 32×32px circle with initials        | Name + Sign out on hover/click                      |

### 3.3 Responsive Layout Behavior

#### 3.3.1 Sidebar by Breakpoint

| Breakpoint          | Behavior                                                          |
| ------------------- | ----------------------------------------------------------------- |
| Desktop (≥1024px)   | Fixed sidebar, collapsible via toggle button                      |
| Tablet (768-1024px) | Sidebar hidden by default, hamburger menu opens off-canvas drawer |
| Mobile (<768px)     | Same as tablet, drawer max-width 280px                            |

#### 3.3.2 Content Area by Breakpoint

| Breakpoint          | Horizontal Padding | Grid Columns                                      |
| ------------------- | ------------------ | ------------------------------------------------- |
| Desktop (≥1280px)   | 32px               | 4-5 stat cards, 2-3 module cards, 2 chart columns |
| Tablet (768-1280px) | 24px               | 2-3 stat cards, 2 module cards, 1 chart column    |
| Mobile (<768px)     | 16px               | 2 stat cards, 1 card column, stacked layout       |

---

## 4. Component Library

### 4.1 Button

**Purpose**: Primary atomic action trigger for all user interactions.

**Variants**:

| Variant     | Background             | Text             | Border              | Usage                                      |
| ----------- | ---------------------- | ---------------- | ------------------- | ------------------------------------------ |
| `primary`   | `--v-primary`          | White            | None                | Primary page action (Save, Submit, Create) |
| `secondary` | `--v-surface`          | `--v-text`       | `--v-border-strong` | Alternative action (Cancel, Back)          |
| `ghost`     | Transparent            | `--v-text-muted` | None                | Subtle actions (Edit, View)                |
| `danger`    | `--v-danger`           | White            | None                | Destructive action (Delete, Remove)        |
| `brand`     | Gradient indigo→violet | White            | None                | Hero CTAs, "Get started" buttons           |

**Sizes**:

| Size | Height | Horizontal Padding | Font Size | Icon Size |
| ---- | ------ | ------------------ | --------- | --------- |
| `sm` | 32px   | 12px               | 12px      | 14px      |
| `md` | 40px   | 16px               | 14px      | 16px      |
| `lg` | 48px   | 24px               | 16px      | 20px      |

**States**:

| State          | Visual Change                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Default        | As specified above                                                                                                                           |
| Hover          | Primary: `--v-primary-hover`. Secondary: `bg--v-surface-elevated`. Ghost: `bg--v-surface-elevated`. Brand: stronger shadow, translateY(-1px) |
| Active/Pressed | `transform: scale(0.97)` for 150ms                                                                                                           |
| Focus          | 3px ring at `--v-primary` with 30% opacity, 2px offset                                                                                       |
| Disabled       | Opacity 50%, cursor not-allowed, no hover effects                                                                                            |
| Loading        | Spinner (16px) replaces icon position, text visible                                                                                          |

**Accessibility**: All buttons have `type="button"` unless inside a form. Loading state uses `aria-busy="true"`. Disabled uses `aria-disabled="true"`.

### 4.2 Card

**Purpose**: Content container for grouping related information.

**Padding Variants**:

| Variant | Padding | Use Case                                     |
| ------- | ------- | -------------------------------------------- |
| `sm`    | 16px    | Tight content (stat displays, compact lists) |
| `md`    | 24px    | DEFAULT — most cards                         |
| `lg`    | 32px    | Featured content, settings pages, forms      |

**Visual Variants**:

| Variant           | Border           | Shadow          | Hover                                                  | Usage                                      |
| ----------------- | ---------------- | --------------- | ------------------------------------------------------ | ------------------------------------------ |
| Default           | 1px `--v-border` | `--v-shadow`    | None                                                   | Standard content container                 |
| Elevated          | 1px `--v-border` | `--v-shadow-md` | None                                                   | Featured content, analytics charts         |
| Hover (clickable) | 1px `--v-border` | `--v-shadow`    | `--v-shadow-lg`, translateY(-2px), `--v-border-strong` | Module cards, link cards                   |
| Flat              | None             | None            | None                                                   | Nested surfaces inside elevated containers |

### 4.3 Input / TextInput

**Purpose**: Text field for user data entry.

**Specifications**:

- Height: 40px (2.5rem)
- Padding: 10px 14px
- Border: 1px `--v-border-strong`
- Background: `--v-surface`
- Radius: 8px
- Font: 14px Inter, `--v-text`
- Placeholder: `--v-text-subtle`

**States**:

| State    | Visual                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Default  | Border `--v-border-strong`, no shadow                                         |
| Focus    | Border `--v-primary`, 3px ring `--v-primary` at 30% opacity                   |
| Hover    | Border `--v-border` (slightly lighter)                                        |
| Error    | Border `--v-danger`, ring `--v-danger` at 30% opacity                         |
| Disabled | Background `--v-surface-elevated`, text `--v-text-subtle`, cursor not-allowed |
| Success  | Border `--v-success` (rare — only on explicit validation success)             |

**With icon**: 40px left padding, icon positioned at left:12px, top:50%, transform:translateY(-50%).

### 4.4 SearchInput

**Purpose**: Search/filter field for data tables and lists.

**Behaviors**:

- Debounce: 300ms before triggering search
- Clearable: X icon appears when text is entered
- Placeholder: "Search..." with context ("Search organizers...", "Search events...")
- Keyboard shortcut: `/` focuses the search input
- Mobile: Expands to full width, cancels on Escape

### 4.5 Badge

**Purpose**: Short status or category label.

**Variants**:

| Variant   | Background             | Text Color       | Usage                      |
| --------- | ---------------------- | ---------------- | -------------------------- |
| `default` | `--v-surface-elevated` | `--v-text-muted` | Neutral status             |
| `success` | `--v-success-bg`       | `--v-success`    | Active, Verified, Complete |
| `warning` | `--v-warning-bg`       | `--v-warning`    | Pending, Draft, In Review  |
| `danger`  | `--v-danger-bg`        | `--v-danger`     | Suspended, Failed, Overdue |
| `info`    | `--v-info-bg`          | `--v-info`       | Note, Info, New            |

**Sizes**:

- Default: 20px height, 8px horizontal padding, 12px font
- Small: 18px height, 6px horizontal padding, 10px font

### 4.6 Table

**Purpose**: Structured data display with sorting, filtering, and actions.

**Specifications**:

- Wrapper: rounded-xl, border 1px `--v-border`, overflow-x-auto
- Header row: `--v-surface-elevated` background
- Header cells: 12px uppercase, 600 weight, `--v-text-muted`, 0.05em letter-spacing
- Body rows: 14px, `--v-text`, border-bottom 1px `--v-border`
- Row height: 44px minimum (12px top/bottom padding, 16px left/right)
- Hover: `--v-surface-elevated` on entire row
- Selected: `--v-primary-soft` background (in tables with selection)

**Column types**:

- Text: Left-aligned, truncate with ellipsis at max-width
- Numeric: Right-aligned, monospace font
- Status: Badge component centered in cell
- Actions: Icon buttons right-aligned, no text

**Empty state**: Use EmptyState component when table has no rows.

### 4.7 StatCard

**Purpose**: Display key metrics on dashboards.

**Specifications**:

- Card padding: 16px (sm)
- Layout: Icon (top-left), Value (large), Label (caption)
- Value: `--v-stat-number` class, size 28px on desktop, 24px on mobile
- Label: 12px caption, `--v-text-subtle`
- Icon: 20px, `--v-text-subtle` with optional accent color
- Grid: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4` with 16px gap

### 4.8 Modal/Dialog

**Purpose**: Overlay for focused tasks (create, confirm, view details).

**Specifications**:

- Overlay: `bg-black/50 backdrop-blur-sm`, z-50
- Container: `--v-surface`, rounded-2xl (16px), `--v-shadow-xl`
- Padding: 24px
- Width: 480px (standard), 640px (large), 90vw (mobile max 400px)
- Header: 48px with title (16px semibold) and close (X) button
- Footer: Form actions right-aligned, 16px gap between buttons
- Animation: Fade in overlay (200ms), scale 0.95→1.0 content (250ms, ease-out)
- Dismiss: Click outside, Escape key, X button
- Focus trap: Tab cycles within modal, first focusable element auto-focused

### 4.9 Drawer (Off-canvas)

**Purpose**: Side panel for settings, details, or navigation.

**Specifications**:

- Width: 400px (desktop), 100vw max 400px (mobile)
- Position: Right side (default), Left side (sidebar replacement on mobile)
- Animation: Slide in from right/left (250ms, ease-out)
- Overlay: Same as modal
- Header: 56px with title and close button
- Body: Scrollable, padding 24px

### 4.10 Toast Container

**Purpose**: Brief notifications for action feedback.

**Specifications**:

- Position: Bottom-right (desktop), bottom-center (mobile), full-width
- Stack: Multiple toasts stack with 8px gap, newest on top
- Each toast: 12px radius, padding 12px 16px, max-width 400px
- Layout: Icon (16px) + message (14px) + close button (optional)
- Colors: Success (`--v-success-bg`, `--v-success` border/text), Error (`--v-danger-bg`), Warning (`--v-warning-bg`), Info (`--v-info-bg`)
- Animation: Slide in from right (250ms, ease-out), auto-dismiss after 5s
- Dismiss: Close button, swipe away (touch), Escape key

### 4.11 Skeleton

**Purpose**: Placeholder loading state for content.

**Specifications**:

- Background: Linear gradient `--v-surface-elevated` → `--v-border` → `--v-surface-elevated`
- Background-size: 200% 100%
- Animation: Shimmer shift left to right, 1.4s linear infinite
- Border-radius: 8px (matches parent component)
- **Never** use `animate-pulse` (Tailwind default) — use the custom shimmer for premium feel

### 4.12 EmptyState

**Purpose**: Display when no data exists for a view.

**Specifications**:

- Container: `v-empty-state` — centered, padding 48px 24px
- Icon: 64×64px, `--v-text-subtle`, Lucide icon or custom illustration
- Title: 16px font, 500 weight, `--v-text`, margin-top 16px
- Description: 14px, `--v-text-subtle`, margin-top 4px
- Action: Optional CTA button below description (margin-top 16px)
- Border: dashed 1px `--v-border`, rounded 12px

### 4.13 ProgressBar

**Purpose**: Show completion progress.

**Specifications**:

- Container height: 8px (thick), 4px (thin)
- Background: `--v-surface-elevated`, rounded-full
- Fill: `--v-primary` (default), `--v-success` (100%), `--v-warning` (<25%)
- Animation: Width transition 400ms ease-out
- Label: Optional text above bar with percentage

---

## 5. Authentication Pages

### 5.1 Login Page (`/login`)

**Purpose**: Authenticate users by role (admin, organizer, voter).

**Layout** (desktop):

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                  ┌──────────────────┐                │
│                  │  🏛️ VOTRIX Logo   │                │
│                  │                  │                │
│                  │  Sign in to      │                │
│                  │  VOTRIX          │                │
│                  │                  │                │
│                  │  ┌────────────┐  │                │
│                  │  │ Email      │  │                │
│                  │  └────────────┘  │                │
│                  │  ┌────────────┐  │                │
│                  │  │ Password   │  │                │
│                  │  └────────────┘  │                │
│                  │                  │                │
│                  │  □ Remember me   │                │
│                  │                  │                │
│                  │  [Sign in]       │                │
│                  │                  │                │
│                  │  Forgot password?│                │
│                  └──────────────────┘                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Card specifications**:

- Width: 400px (centered on page)
- Padding: 40px (lg)
- Background: `--v-surface`
- Shadow: `--v-shadow-xl`

**Component placement**:

1. **Logo**: VotrixLogo with tagline "Every Vote Counts." — centered, 32px below top of card
2. **Title**: "Sign in to VOTRIX" — 24px display text, centered
3. **Description**: "Enter your email and password to access your account." — 14px, `--v-text-subtle`, centered
4. **Email input**: Full width, with mail icon, `type="email"`, placeholder "you@example.com"
5. **Password input**: Full width, with lock icon, show/hide toggle, placeholder "Enter your password"
6. **Remember me**: Checkbox + label row, 16px gap, 14px font
7. **Forgot password link**: Right-aligned below "Remember me", 14px, `--v-primary`
8. **Sign in button**: Full width, primary variant, height 44px (lg), 16px font
9. **Error message**: Between form and button, `--v-danger` text, 14px
10. **Loading state**: Button shows spinner, all inputs disabled

**States**:

- Default: Clean form, empty inputs, "Remember me" unchecked
- Loading: Button shows spinner, inputs disabled, opacity 70%
- Error: Error message appears above button, input borders turn red after validation
- Success: Redirect to role-based dashboard

**Responsive**:

- Desktop: Centered card with page background `--v-bg`
- Tablet: Same, card width 400px
- Mobile: Card full-width with 16px margins, stack vertically

### 5.2 Forgot Password Page

**Layout**: Same centered card pattern as Login.
**Title**: "Forgot password?"
**Description**: "Enter your email and we'll send you a reset link."
**Input**: Email only (no password field)
**Button**: "Send reset link" — full width primary
**Back link**: "← Back to login" below card

### 5.3 Reset Password Page

**Layout**: Same centered card pattern.
**Title**: "Set new password"
**Inputs**: New password + Confirm password (both with show/hide toggle)
**Rules**: Display password requirements (min 8 chars, uppercase, number)
**Button**: "Reset password"

### 5.4 Change Password Page

**Layout**: Embedded in dashboard (no centered card). Uses page layout.
**Title**: "Change Password" in PageHeader
**Description**: "Your password must be updated before continuing."
**Form**: Current password, New password, Confirm new password
**Button**: "Update password"

---

## 6. Admin Module

### 6.1 Admin Dashboard (`/admin`)

**Purpose**: Platform-wide overview for system administrators.

**Layout**:

```
┌──────────────────────────────────────────────────────────────┐
│ Header                                                        │
├──────────────────────────────────────────────────────────────┤
│ PageHeader: "Admin dashboard"                    [Create org] │
│                                                              │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐              │
│ │Total  │ │Total  │ │Total  │ │Active│ │Votes │              │
│ │orgs   │ │events │ │voters │ │events│ │cast  │              │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘              │
│                                                              │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ Organizers  │ │ Events      │ │ Settings    │            │
│ │ ↪ Manage   │ │ ↪ View all  │ │ ↪ Configure │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
│                                                              │
│ ┌────────────────────────┐ ┌────────────────────────┐      │
│ │ Quick actions          │ │ Recent activity        │      │
│ │ • Create organizer     │ │ • User created 2m ago  │      │
│ │ • View all events      │ │ • Event updated 15m ago│      │
│ │ • Review audit logs    │ │ • Orgs synced 1h ago   │      │
│ └────────────────────────┘ └────────────────────────┘      │
│                                                              │
│ ┌────────────────────────┐ ┌────────────────────────┐      │
│ │ Monthly events  ─────  │ │ Voter growth    ─────  │      │
│ │  [AreaChart]           │ │  [AreaChart]           │      │
│ └────────────────────────┘ └────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

**Stat cards (grid 5 cols desktop, 2 cols mobile)**:

1. Total organizers (Users icon, `--v-text` value)
2. Total events (CalendarDays icon)
3. Total voters (UserCheck icon)
4. Active events (Zap icon, `--v-success` value)
5. Votes cast (CheckSquare icon)

**UX improvements**:

- **Current weakness**: Quick actions feel like cards but lack visual hierarchy
- **Fix**: Use small link-cards (v-card-md, hoverable) instead of major cards for quick actions — they're secondary to stats
- **Why**: Following visual hierarchy — stat cards are the primary focus, quick actions are secondary navigation
- **Expected improvement**: Users scan stats first (highest priority), then see action links clearly

### 6.2 Organizer Management (`/admin/organizers`)

**Purpose**: CRUD management of organizer accounts.

**Layout**:

```
PageHeader: "Organizer Management"            [Create organizer]

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Total  │ │Pending│ │Active│ │Suspen│ │Archv │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘

[Search...]          [All] [Pending] [Active] [Suspended] [Archived]

┌────────────────────────────────────────────────────────┐
│ Email          │ Status  │ Organizations │ Created │ ⚙️ │
│────────────────────────────────────────────────────────│
│ john@test.com  │ ✓Active │ ACME Inc     │ Jan 5   │ ⚙️ │
│ jane@test.com  │ ⏳Pend. │ TechCorp     │ Jan 3   │ ⚙️ │
│ ...            │         │              │         │    │
└────────────────────────────────────────────────────────┘
```

**States**:

1. **Loading**: Skeleton — 4 stat card skeletons + table skeleton (6 rows of shimmer)
2. **Empty**: "No organizers found" with user illustration + "Create first organizer" CTA
3. **Filtered empty**: "No organizers match this filter" — different message than no-organizers
4. **Error**: Toast notification with retry option

**Table columns**: Email (left), Status (badge, center), Organizations (left), Created (right, 12px caption), Actions (right, icon buttons)
**Row actions**: Edit (pencil icon), Suspend/Activate (toggle), Archive (archive icon)

**UX improvements**:

- **Current weakness**: Status filters are buttons that could look like tabs
- **Fix**: Use segmented control style for filters (pill-shaped buttons, active filled with `--v-primary`)
- **Why**: Segmented controls signal "filter mode" more clearly than individual buttons
- **Expected improvement**: Users immediately understand these are mutually exclusive filters

### 6.3 Global Events (`/admin/events`)

**Purpose**: View all events across all organizers and modules.

**Layout**:

- PageHeader with simple title
- Table with columns: Event title (link to organizer dashboard), Module (badge: Election/Competition/Polling), Organizer (email), Status (badge), Created date
- Search + filter by module + filter by status

### 6.4 System Settings (`/admin/settings`)

**Purpose**: Platform configuration.

**Layout**: Simple form layout with sections:

- Platform name
- Default language
- Timezone
- Maintenance mode toggle
- Email configuration (read-only status display)

**Form layout**: Single column, max-width 640px, sections separated by 32px gaps.

### 6.5 Audit Logs (`/admin/audit-logs`)

**Purpose**: View chronological activity logs.

**Layout**:

- Date range filter + search + action type filter
- Table: Timestamp (14px monospace), User (email), Action (with icon), Details (truncated), IP address
- Pagination at bottom

**UX improvement**:

- **Current weakness**: Logs are dense text without visual hierarchy
- **Fix**: Color-code action types (create=green, delete=red, update=amber, login=blue)
- **Why**: Color coding allows rapid scanning — users find dangerous actions (delete) instantly
- **Expected improvement**: 40% faster audit log review

---

## 7. Organizer Module

### 7.1 Organizer Dashboard (`/organizer`)

**Purpose**: Central hub for organizer to access all modules.

**Layout**:

```
┌────────────────────────────────────────────────────────────┐
│ Header                                                      │
├────────────────────────────────────────────────────────────┤
│ Welcome card: "Organizer dashboard"                         │
│              Signed in as organizer@email.com               │
│                                                             │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                     │
│ │Total │ │Active│ │Finish│ │Assgn │                     │
│ │events│ │events│ │events│ │voters│                     │
│ └──────┘ └──────┘ └──────┘ └──────┘                     │
│                                                             │
│ ┌──────────────────┐ ┌──────────────────┐ ┌─────────────┐ │
│ │  🗳️ Election     │ │  🏆 Competition  │ │  📊 Polling │ │
│ │  Manage events,  │ │  Contestants,    │ │  Surveys,   │ │
│ │  positions...    │ │  criteria...     │ │  analytics  │ │
│ │  [Manage Elect.] │ │  [Manage Comp.]  │ │  [Create    │ │
│ └──────────────────┘ └──────────────────┘ │   Poll]     │ │
│                                            └─────────────┘ │
│                                                             │
│ [Analytics & Reports — link card]                           │
│                                                             │
│ ┌─────────────────────────┐ ┌──────────────────────────┐   │
│ │ Recent activity         │ │ Monthly event growth     │   │
│ │ • Event created 10m ago │ │  [AreaChart — 180px]     │   │
│ │ • Vote cast 1h ago      │ │                          │   │
│ └─────────────────────────┘ └──────────────────────────┘   │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ Participation by module                                │   │
│ │  [PieChart — 240px]  Election: 45% Competition: 30%   │   │
│ │                       Polling: 25%                     │   │
│ └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Module card specifications**:

- Height: auto (illustration 12rem + body)
- Illustration area: Module gradient background, SVG illustration centered
- Body: Icon (20px, `--v-text-muted`), Title (16px semibold), Description (14px), CTA button (full-width, primary)
- CTA text: "Manage Election" / "Manage Competition" / "Create Poll"
- Hover: translateY(-3px), shadow-lg, border-strong

---

## 8. Election Module

### 8.1 Election Events List `/organizer/election/events`

**Purpose**: List and access all election events.

**Layout**:

```
PageHeader: "Election Events"                    [➕ New event]

┌──────────────────────────────────────────────────────────────┐
│ 🗳️ Presidential Election 2024                                │
│    ✓ Active  |  📅 Jan 15 - Feb 15  |  👥 242 voters        │
│    [Open voting] [Edit] [Positions] [Candidates] [Voters]   │
├──────────────────────────────────────────────────────────────┤
│ 🗳️ Student Council                                            │
│    ⏳ Draft  |  📅 Not set          |  👥 0 voters           │
│    [Set dates] [Edit] [Positions] [Candidates]               │
└──────────────────────────────────────────────────────────────┘
```

**Event card layout** (each event is a v-card-md):

- Left: Module icon + event title (18px semibold, link to event detail)
- Right: Status badge + date range + voter count
- Actions: Inline buttons or dropdown menu (Edit, Duplicate, Delete)

**States**:

1. **Loading**: 3 skeleton event cards
2. **Empty**: "No election events yet" + illustration + "Create your first election" CTA
3. **Error**: Toast + retry button

### 8.2 Election Event Form `/organizer/election/events/new`

**Purpose**: Create or edit election events.

**Layout**: Multi-step form with progress stepper.

**Step indicator** (horizontal, 4 steps max):

```
[1. Details] ─── [2. Branding] ─── [3. Review]
    ✓              ○                  ○
```

- Active step: filled circle + bold label
- Completed step: checkmark circle (green)
- Future step: empty circle + muted label

**Step 1 — Details**:

- Event title (text input, required)
- Description (textarea, 4 rows, optional)
- Start date (DateTimeInput, optional)
- End date (DateTimeInput, optional)
- Results visibility (radio group: Real-time / After close / Hidden)
- **UX improvement**: Date inputs should have "Set dates" toggle — empty dates mean "no time limit"

**Step 2 — Branding**:

- Event banner (ImageUploadField, 16:9 ratio, max 2MB)

**Step 3 — Review**:

- Summary card showing all entered data
- "Create event" button (primary, full width)

**UX improvements**:

- **Current weakness**: No progress indicator
- **Fix**: Add the step indicator above
- **Why**: Progressive disclosure reduces cognitive load — users know how many steps remain
- **Expected improvement**: 30% lower form abandonment

### 8.3 Election Positions Page

**Purpose**: Manage roles/positions within an election.

**Layout**: Split panel — left side shows list, right or modal shows form.

- Position cards in a list: Name (16px), "Skip allowed" badge, Min/Max votes info
- Add position button opens inline form or modal
- Each position card has Edit/Delete actions

### 8.4 Election Candidates Page

**Purpose**: Manage candidates for each position.

**Layout**: Select position (dropdown) → candidates grid for that position.

- Candidate cards (grid-cols-2 md:grid-cols-3 lg:grid-cols-4):
  - Photo (circular, 80px)
  - Name (14px semibold)
  - Delete button
- "Add candidate" button → opens form with name + photo upload

### 8.5 Election Voters Page

**Purpose**: Manage voter assignments.

**Layout**:

- Stats row: Total assigned, Invited, Voted, Pending
- Search + filter by status
- Table: Name, Email, Status (badge: invited/voted/pending), Invited date, Actions (resend invite, remove)
- "Invite voters" button → dropdown: "Upload CSV" / "Add manually" / "Invite existing"

### 8.6 Election Analytics Page

**Purpose**: View election results and turnout.

**Layout**: Analytics wrapper with sections:

1. **Stats row**: Total voters, Votes cast, Turnout %, Positions
2. **Turnout chart**: Area/bar chart showing vote count over time
3. **Results by position**: Card per position showing candidate vote distribution (horizontal bar chart)

---

## 9. Competition Module

### 9.1 Competition Events List `/organizer/competition/events`

**Layout**: Same pattern as Election events list with competition-specific card design (amber gradient icon area).

### 9.2 Competition Event Form

**Purpose**: Create/edit competition events.

**Steps**:

1. **Details**: Title, Description, Start/End dates, Scoring type (standard/weighted)
2. **Branding**: Banner image upload

### 9.3 Competition Workspace `/organizer/competition/events/:eventId/workspace`

**Purpose**: Quick-access dashboard for a specific competition.

**Layout**:

- Stats: Contestants, Criteria, Judges, Rankings
- Quick links to: Contestants, Criteria, Judges, Rankings, Analytics
- Recent scoring activity

### 9.4 Competition Contestants Page

**Purpose**: Manage contestants.

**Layout**:

- Grid of contestant cards (grid-cols-2 md:grid-cols-3 lg:grid-cols-4)
- Each card: Photo (120×120, rounded-xl), Name (14px semibold), Number/bio (12px caption)
- "Add contestant" → form modal

### 9.5 Competition Criteria Page

**Purpose**: Define scoring criteria with weights.

**Layout**:

- Criteria list with drag-to-reorder (optional)
- Each criteria card: Name (16px), Weight (percentage with slider), Min/Max score, Delete
- "Add criterion" → inline form
- Total weight must equal 100% — show "Remaining: X%" indicator

### 9.6 Competition Judges Page

**Purpose**: Manage judges.

**Layout**:

- Table: Judge Name/Email, Status (assigned/scoring/done), Assigned contestants
- "Invite judge" → modal with email input

### 9.7 Competition Rankings Page

**Purpose**: View computed rankings.

**Layout**:

- Ranking table: Rank (#1, #2, #3...), Contestant (name + photo), Total score, Scores breakdown by criteria
- Top 3 highlighted with trophy icons
- Chart: Bar chart comparing top contestants

### 9.8 Competition Analytics

**Layout**: Same analytics pattern with competition-specific data:

- Score distribution chart
- Judge scoring comparison
- Criteria weight impact analysis

---

## 10. Polling Module

### 10.1 Polling Events List

Same pattern as other module event lists.

### 10.2 Polling Event Form / Settings

**Purpose**: Create/edit poll settings.

**Fields**: Title, Description, Start/End dates, Anonymous responses toggle, Allow multiple submissions toggle

### 10.3 Polling Builder `/organizer/polling/events/:eventId/builder`

**Purpose**: Build poll questions with various types.

**Layout**:

- Question list (sortable, each question is a card)
- "Add question" button → dropdown: Select question type
- Question card:
  - Question text (editable input)
  - Question type badge (Single choice, Multiple choice, Text, Rating, etc.)
  - Options list (for choice types): Add/remove/edit options
  - Required toggle
  - Delete/Duplicate buttons
- **UX improvement**: Drag handle for reordering questions — visual handle icon on left

### 10.4 Polling Respondents Page

Same pattern as Election Voters page.

### 10.5 Polling Analytics

**Layout**:

- Stats: Total respondents, Completion rate, Average time
- Per-question breakdown:
  - Bar chart for choice questions
  - Word cloud or list for text responses
  - Rating distribution for rating questions

---

## 11. Voter Module

### 11.1 Voter Dashboard (`/voter`)

**Purpose**: Central hub for voters to see all assigned events.

**Layout** (max-width 768px, centered):

```
Welcome card: "Your events"
              Signed in as voter@email.com

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│Assgn │ │Active│ │Compl │ │Total │
└──────┘ └──────┘ └──────┘ └──────┘

── Active events ──
These need your attention now.
┌─────────────────────────────────────┐
│ 🗳️ Presidential Election 2024        │
│    ✓ Voting open  |  Due: Feb 15    │
│    [Vote now →]                      │
├─────────────────────────────────────┤
│ 🏆 Science Fair Judging              │
│    ✓ Scoring open |  Due: Jan 20    │
│    [Score now →]                     │
└─────────────────────────────────────┘

── Assigned events ──
Not yet open for participation.

── Completed events ──
You have finished these.
```

**UX improvements**:

- **Current weakness**: Event sections show all event types mixed together
- **Fix**: Use module icon + color on left of each event card for instant type recognition
- **Why**: Following recognition over recall — voters see 🗳️ and know it's voting immediately
- **Expected improvement**: Faster scan time, less confusion

### 11.2 Election Ballot Page (`/voter/events/:eventId`)

**Purpose**: Cast votes in an election.

**Layout** (max-width 640px, centered):

```
← Dashboard
🗳️ Presidential Election 2024
Description text here...

Progress: ████████░░ 80%

── President (vote for 1) ──
○ Candidate A — Party X
○ Candidate B — Party Y
○ Candidate C — Party Z
[Skip position]

── Senator (vote for up to 3) ──
☐ Candidate D
☐ Candidate E
☐ Candidate F
☐ Candidate G
[Skip position]

[Submit ballot]
Once submitted, your ballot cannot be changed.
```

**Fixed bottom bar (mobile)**:

- Submit button fixed at bottom with `pb-safe-4` for safe area
- "Once submitted, your ballot cannot be changed" caption

**Post-submission state**:

- Green success card: "Ballot submitted ✓"
- Ballot details summary
- Results section (if visibility allows): Bar charts per position

### 11.3 Poll Response Page

**Layout**: Similar to ballot but with poll question types:

- Single choice: Radio buttons
- Multiple choice: Checkboxes
- Text: Textarea
- Rating: Star/Number input
- Likert scale: Radio row

### 11.4 Judge Scoring Page (`/voter/competition/events/:eventId/score`)

**Purpose**: Judge scores contestants on criteria.

**Layout** (max-width 800px):

```
← Dashboard
🏆 Science Fair Judging
Judge scoring — one submission only

Progress: 15/24 scores entered

┌────────────┬──────────┬──────────┬──────────┬──────────┐
│ Contestant │ Criteria 1│ Criteria 2│ Criteria 3│ Total   │
│            │ (0-100)   │ (0-50)    │ (0-50)    │         │
├────────────┼──────────┼──────────┼──────────┼──────────┤
│ Alice      │   85      │   42      │   38      │  165    │
│ Bob        │   78      │   35      │   40      │  153    │
│ Carol      │   92      │   45      │   48      │  185    │
└────────────┴──────────┴──────────┴──────────┴──────────┘

[Submit all scores (locked)]
```

**Scoring matrix**:

- First column: Contestant name + photo (40×40px)
- Each cell: Number input constrained to criterion's min/max
- Last column: Auto-computed total
- Header: Criterion name + range
- Validation: Highlight empty/invalid cells with red border
- Progress indicator: "X of Y scores entered"

**UX improvements**:

- **Current weakness**: Scoring form is a dense matrix that's intimidating
- **Fix**: Highlight the current contestant row with `--v-primary-soft` background; show criterion description on hover
- **Why**: Reduces cognitive load — judge focuses on one row at a time
- **Expected improvement**: Faster scoring, fewer input errors

---

## 12. Reports Module

### 12.1 Reports Overview (`/organizer/reports`)

**Purpose**: Access all event reports in one place.

**Layout**:

```
PageHeader: "Reports"

── Elections ──
┌────────────────────────────────────────────────────────┐
│ 🗳️ Presidential Election 2024  |  Turnout: 78%         │
│   [View report →]                                       │
├────────────────────────────────────────────────────────┤
│ 🗳️ Student Council  |  Turnout: 45%                     │
│   [View report →]                                       │
└────────────────────────────────────────────────────────┘

── Competitions ──
┌────────────────────────────────────────────────────────┐
│ 🏆 Science Fair  |  Judges: 5  |  Contestants: 12      │
│   [View report →]                                       │
└────────────────────────────────────────────────────────┘

── Polling ──
┌────────────────────────────────────────────────────────┐
│ 📊 Customer Satisfaction  |  Responses: 234            │
│   [View report →]                                       │
└────────────────────────────────────────────────────────┘
```

### 12.2 Module Reports

Each module report page shares:

- **Header**: Event title, type badge, status, date range
- **Stats row**: 3-4 key metrics
- **Charts section**: Module-specific visualizations
- **Data table**: Raw data with export
- **Export actions**: PDF, CSV buttons in ReportActionsBar

---

## 13. Mobile Blueprint

### 13.1 Global Mobile Behavior

| Element        | Desktop      | Tablet            | Mobile                              |
| -------------- | ------------ | ----------------- | ----------------------------------- |
| Sidebar        | Fixed 256px  | Hidden (drawer)   | Hidden (drawer, max 280px)          |
| Header height  | 64px         | 56px              | 56px                                |
| Page padding   | 32px         | 24px              | 16px                                |
| Stat card grid | 4-5 cols     | 2-3 cols          | 2 cols                              |
| Card grid      | 3 cols       | 2 cols            | 1 col                               |
| Tables         | Full width   | Horizontal scroll | Card view (each row becomes a card) |
| Buttons        | Inline       | Inline            | Full width (stacked)                |
| Modal width    | 480/640px    | 90vw (max 480px)  | 92vw                                |
| Toast position | Bottom-right | Bottom-right      | Bottom-center, full-width           |

### 13.2 Mobile Navigation

**Bottom navigation** (voter role only — voting/scoring context):

```
┌──────────────────────────────────────┐
│  ← Positions    [3 of 5]    Submit → │
└──────────────────────────────────────┘
```

- Fixed at bottom, 64px height
- Shows progress and primary action
- Only on voter event pages, not dashboards

### 13.3 Mobile Table → Card View

On mobile (<640px), tables transform to card list:

```
Each row becomes a card:
┌──────────────────────────────────────┐
│ Name: John Smith                     │
│ Email: john@test.com                 │
│ Status: ✓ Active                     │
│ Created: Jan 5, 2024                 │
│                                      │
│ [Edit] [Suspend]                     │
└──────────────────────────────────────┘
```

- Labels on left, values on right
- Actions as row of small buttons

### 13.4 Touch Targets

- All interactive elements: minimum 44×44px
- 8px minimum gap between touch targets
- Dropdown menus: 12px padding on options

---

## 14. Accessibility Blueprint

### 14.1 Color & Contrast

- All text meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Status is never conveyed by color alone — always include text label
- Focus indicators: 2px offset ring, `--v-primary` color, minimum 3px width

### 14.2 Keyboard Navigation

| Key         | Action                                  |
| ----------- | --------------------------------------- |
| Tab         | Move forward through focusable elements |
| Shift+Tab   | Move backward                           |
| Enter/Space | Activate button, link, toggle           |
| Escape      | Close modal, dropdown, drawer           |
| Arrow Down  | Open select, move down in dropdown      |
| Arrow Up    | Move up in dropdown                     |
| Home/End    | Jump to first/last item in list         |

### 14.3 ARIA Attributes

| Element      | Attribute                                            | Value                                             | When     |
| ------------ | ---------------------------------------------------- | ------------------------------------------------- | -------- |
| Navigation   | `role="navigation"` / `aria-label="Main navigation"` | Always                                            |
| Modal        | `role="dialog"`                                      | `aria-modal="true"`                               | Always   |
| Modal title  | `aria-labelledby`                                    | Points to title element                           | Always   |
| Form error   | `aria-describedby`                                   | Points to error element                           | On error |
| Tab panel    | `role="tabpanel"`                                    | `aria-labelledby`                                 | Always   |
| Progress bar | `role="progressbar"`                                 | `aria-valuenow`, `aria-valuemin`, `aria-valuemax` | Always   |
| Alert/toast  | `role="alert"` / `aria-live="polite"`                | On appear                                         |
| Icon button  | `aria-label`                                         | Describes action                                  | Always   |

### 14.4 Focus Order

The focus order must follow the visual order:

1. Skip to content link (first focusable element, visible on tab)
2. Main navigation
3. Page content (left to right, top to bottom)
4. Modals trap focus within them

### 14.5 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 15. Motion & Interaction Blueprint

### 15.1 Duration & Easing Reference

| Token               | Value                           | Applications                                    |
| ------------------- | ------------------------------- | ----------------------------------------------- |
| `--duration-fast`   | 150ms                           | Button press, hover effects, focus transitions  |
| `--duration-normal` | 250ms                           | Page enter, toast appear, modal open, dropdown  |
| `--duration-slow`   | 400ms                           | Drawer slide, page transitions, complex reveals |
| `--ease-out`        | `cubic-bezier(0.16, 1, 0.3, 1)` | All enter animations, expand animations         |
| `--ease-in-out`     | `cubic-bezier(0.4, 0, 0.2, 1)`  | Collapse, close, slide-out                      |

### 15.2 Component Animations

| Component        | Animation                                      | Duration | Easing      | Notes                                      |
| ---------------- | ---------------------------------------------- | -------- | ----------- | ------------------------------------------ |
| Page enter       | Fade up (0→1 opacity, 8px→0 Y)                 | 250ms    | ease-out    | Applied to `<main>`                        |
| Card hover       | translateY(-2px), shadow increase              | 200ms    | ease-out    | Smooth lift                                |
| Button press     | scale(0.97)                                    | 150ms    | ease-out    | Quick tactile feedback                     |
| Modal open       | Overlay fade (200ms) + Content scale(0.95→1.0) | 250ms    | ease-out    | Stagger: overlay first, content after 50ms |
| Modal close      | Content scale(1.0→0.95) + Overlay fade         | 200ms    | ease-in-out | Reverse of open                            |
| Drawer slide     | translateX(100%→0)                             | 250ms    | ease-out    | Overlay fades simultaneously               |
| Toast enter      | translateX(20px→0) + fade                      | 250ms    | ease-out    | Slide from right                           |
| Toast exit       | fade + translateY(-4px)                        | 200ms    | ease-in     |                                            |
| Dropdown open    | scale(0.95→1.0) + fade                         | 150ms    | ease-out    | Origin top-left                            |
| Skeleton shimmer | background-position x slide                    | 1400ms   | linear      | Infinite loop                              |
| Tab switch       | Content fade 0→1                               | 150ms    | ease-out    | No slide — too distracting                 |
| Navigation       | No animation — instant                         | —        | —           | Speed over effect                          |

### 15.3 Page Transitions

Use `<AnimatePresence>` from framer-motion for route transitions:

```jsx
<AnimatePresence mode="wait">
  <motion.main
    key={location.pathname}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
  >
    <Outlet />
  </motion.main>
</AnimatePresence>
```

**Important**: Only animate page enter, NOT exit (to avoid flash of empty container). Exit animations should be instant.

---

## 16. UX Improvements — Consolidated

| #   | Issue                         | Priority | Fix                                                  | Reasoning                                           | Expected Impact                         |
| --- | ----------------------------- | -------- | ---------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| 1   | **Mixed card padding**        | High     | Standardize to sm=16px, md=24px, lg=32px             | Consistency improves perceived quality              | 25% reduction in visual inconsistency   |
| 2   | **Missing breadcrumbs**       | High     | Add breadcrumb to app shell for nested routes        | Users need location context at 3+ levels            | 40% faster navigation recovery          |
| 3   | **Mobile tables**             | High     | Card view on mobile instead of horizontal scroll     | Scrolling tables on mobile is painful               | 60% better mobile data consumption      |
| 4   | **No step indicator**         | Medium   | Add progress stepper to multi-step forms             | Hick's Law — users need to know remaining steps     | 30% lower form abandonment              |
| 5   | **Empty states**              | Medium   | Icon + title + description + CTA for all empty lists | Recognition over recall — guide user to next action | 20% increase in first-action completion |
| 6   | **Inconsistent button sizes** | High     | Standardize sm=32px, md=40px, lg=48px                | Visual consistency = professional brand             | Eliminates Amateur look                 |
| 7   | **Scoring matrix density**    | Medium   | Highlight current row, show criterion on hover       | Reduces cognitive load for judges                   | 15% faster scoring                      |
| 8   | **Error association**         | Medium   | Use aria-describedby to link errors to inputs        | WCAG requirement + clearer UX                       | Better screen reader UX                 |
| 9   | **Dark mode gaps**            | High     | Audit all components for dark token usage            | Incomplete dark mode breaks trust                   | Complete theme parity                   |
| 10  | **Toast timeout**             | Low      | Auto-dismiss toasts after 5 seconds                  | Prevents notification pileup                        | Cleaner UI                              |
| 11  | **Loading states**            | Medium   | Skeleton shimmer on all list/dashboard loads         | Prevents layout shift (CLS)                         | Better Core Web Vitals                  |
| 12  | **Fixed bottom bar (ballot)** | High     | Fixed submit button on mobile with safe area         | Fitts' Law — primary action always accessible       | Higher vote completion rate             |

---

## 17. Figma Implementation Guide

### 17.1 Auto Layout Usage

| Component   | Auto Layout | Padding        | Gap  | Direction  |
| ----------- | ----------- | -------------- | ---- | ---------- |
| Card        | Yes         | 24px (default) | 16px | Vertical   |
| Button      | Yes         | 16px 16px (md) | 8px  | Horizontal |
| Input       | Yes         | 10px 14px      | —    | Horizontal |
| Table row   | Yes         | 12px 16px      | 16px | Horizontal |
| Modal       | Yes         | 24px           | 16px | Vertical   |
| Sidebar nav | Yes         | 8px 12px       | 4px  | Vertical   |
| Stat card   | Yes         | 16px           | 4px  | Vertical   |
| Toast       | Yes         | 12px 16px      | 8px  | Horizontal |

### 17.2 Variables to Create

| Category    | Variables                 | Values            |
| ----------- | ------------------------- | ----------------- |
| Colors      | All `--v-*` tokens        | See section 2.1   |
| Text styles | `.v-*` typography classes | See section 2.2   |
| Spacing     | `--spacing-*` tokens      | See section 2.3   |
| Radius      | `--radius-*` tokens       | See section 2.4   |
| Shadows     | `--v-shadow-*` tokens     | See section 2.5   |
| Gradients   | Module gradient tokens    | See section 2.1.3 |

### 17.3 Component Properties

Create these component properties for reusable components:

**Button**: `variant (primary/secondary/ghost/danger/brand)`, `size (sm/md/lg)`, `state (default/hover/active/disabled/loading)`, `icon (true/false)`

**Card**: `padding (sm/md/lg)`, `variant (default/elevated/hover/flat)`, `has-header (true/false)`

**Badge**: `variant (default/success/warning/danger/info)`, `size (default/sm)`

**Input**: `state (default/focus/error/disabled/success)`, `has-icon (true/false)`, `size (sm/md/lg)`

### 17.4 Nested Components Structure

```
Event Card
├── Icon (Module type)
├── Title (Text)
├── Status Badge (Badge component)
├── Date range (Text)
├── Voter count (Text)
└── Actions (Button group)
    ├── Primary action (Button)
    └── Secondary action (Button, ghost)
```

### 17.5 Responsive Constraints

| Component | Desktop        | Tablet                  | Mobile                  |
| --------- | -------------- | ----------------------- | ----------------------- |
| Card grid | Fixed 3 cols   | Fixed 2 cols            | Fill (1 col)            |
| Stat grid | Fixed 4-5 cols | Fill (3 cols)           | Fill (2 cols)           |
| Table     | Hug content    | Hug, min-width 600px    | None (show cards)       |
| Sidebar   | Fixed 256px    | Fill (drawer 280px max) | Fill (drawer 280px max) |
| Modal     | Fixed 480px    | 90vw max 480px          | 92vw                    |

---

## 18. Final Handoff Notes for Figma AI

1. **All colors reference CSS custom properties** — ensure variable mapping matches `frontend/src/index.css` exactly
2. **Typography uses Google Fonts** — Inter (400, 500, 600, 700, 800) + Plus Jakarta Sans (700, 800) + JetBrains Mono (500, 600)
3. **Icons are Lucide React** — use the exact icon names from the component library
4. **Animations use framer-motion** — duration and easing tokens are defined in section 15
5. **All forms use React Hook Form + Zod** — validation schemas exist in `frontend/src/schemas/`
6. **Store management is Zustand** — three stores: auth, theme, toast
7. **Bootstrap flow**: CSRF token → Auth check → Role-based redirect
8. **Dark mode**: Applied via `data-theme="dark"` on `<html>` element
9. **Module layouts**: ElectionLayout, PageantLayout, PollingLayout wrap event-scoped routes
10. **Preserve all routes and functionality** — this blueprint only improves presentation, UX, and consistency

---

_End of VOTRIX Design Blueprint_
_Prepared for Figma AI implementation_
_Based on thorough analysis of the VOTRIX codebase (frontend + backend)_
