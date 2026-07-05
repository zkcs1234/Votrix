/**
 * chartTokens.js
 *
 * Single source of truth for chart colors and axis/grid styling.
 * Uses CSS variables from the Votrix --v-* design token system so
 * charts automatically respect light/dark mode.
 *
 * Usage:
 *   import { CHART_COLORS, getAxisStyle, getGridStyle } from '@/components/charts/chartTokens'
 */

/**
 * Votrix brand palette — maps to --v-* CSS variables where possible.
 * Order matters: index 0 is "primary", the rest cycle through accent hues.
 */
export const CHART_COLORS = [
  'var(--v-primary)',       // 0 — indigo (primary brand)
  'var(--v-success)',       // 1 — emerald
  'var(--v-warning)',       // 2 — amber
  'var(--v-danger)',        // 3 — red
  '#8b5cf6',                // 4 — violet-500 (no matching token)
  '#ec4899',                // 5 — pink-500
  '#06b6d4',                // 6 — cyan-500
  '#84cc16',                // 7 — lime-500
]

/**
 * Fallback hex values used in places that need a concrete color
 * (e.g. Cell fill — CSS vars don't resolve inside SVG fill attributes
 * in some browsers). These must stay in sync with index.css tokens.
 *
 * Light  ↔  Dark values — we pick the dark variant as a safe default
 * since Recharts renders on a dark-ish surface.
 */
export const CHART_COLORS_HEX = {
  primary:  '#818cf8', // --v-primary (dark)
  success:  '#34d399', // --v-success  (dark)
  warning:  '#fbbf24', // --v-warning  (dark)
  danger:   '#f87171', // --v-danger   (dark)
  violet:   '#8b5cf6',
  pink:     '#ec4899',
  cyan:     '#06b6d4',
  lime:     '#84cc16',
}

/**
 * Ordered array of hex colors that can be used for Cell fill in SVG.
 * Aligns with CHART_COLORS by index.
 */
export const CHART_COLORS_HEX_LIST = [
  CHART_COLORS_HEX.primary,
  CHART_COLORS_HEX.success,
  CHART_COLORS_HEX.warning,
  CHART_COLORS_HEX.danger,
  CHART_COLORS_HEX.violet,
  CHART_COLORS_HEX.pink,
  CHART_COLORS_HEX.cyan,
  CHART_COLORS_HEX.lime,
]

/**
 * Returns the hex color for a given semantic name or falls back to
 * cycling through CHART_COLORS_HEX_LIST by index.
 */
export function getChartColor(indexOrName) {
  if (typeof indexOrName === 'string' && CHART_COLORS_HEX[indexOrName]) {
    return CHART_COLORS_HEX[indexOrName]
  }
  const idx = typeof indexOrName === 'number' ? indexOrName : 0
  return CHART_COLORS_HEX_LIST[idx % CHART_COLORS_HEX_LIST.length]
}

/**
 * Shared axis tick / line style objects.
 * Recharts accepts these as plain objects on tick/axisLine/tickLine props.
 *
 * We read CSS variables at call-time so they reflect the active theme.
 */
export function getAxisStyle(fontSize = 11) {
  return {
    tick: { fill: 'var(--v-text-subtle)', fontSize },
    axisLine: { stroke: 'var(--v-border)' },
    tickLine: { stroke: 'var(--v-border)' },
  }
}

/** Subtle Cartesian grid — low opacity so it doesn't dominate. */
export const GRID_STYLE = {
  strokeDasharray: '3 3',
  stroke: 'var(--v-border)',
  strokeOpacity: 0.6,
}

/** contentStyle for Recharts default Tooltip (when not using custom content). */
export const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--v-surface-elevated)',
  border: '1px solid var(--v-border)',
  borderRadius: '8px',
  color: 'var(--v-text)',
  fontSize: 12,
  boxShadow: 'var(--v-shadow-md)',
}

/** labelStyle for Recharts default Tooltip. */
export const TOOLTIP_LABEL_STYLE = {
  color: 'var(--v-text-muted)',
  fontWeight: 500,
  marginBottom: 4,
}

/** itemStyle for Recharts default Tooltip. */
export const TOOLTIP_ITEM_STYLE = {
  color: 'var(--v-text-subtle)',
}

/** Legend wrapper style. */
export const LEGEND_STYLE = {
  fontSize: 12,
  color: 'var(--v-text-subtle)',
}
