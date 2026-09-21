// Score scale helpers — single source of truth for how a competition's score
// range is resolved and labelled. The event's scoring config owns the default
// scale; each MINOR criterion can override it with its own score type. Mirrors
// the backend resolveScoreBounds so the organizer previews match what judges
// actually score.

export function resolveScaleBounds(scoringConfig) {
  const cfg = scoringConfig ?? {}
  switch (cfg.scoreType) {
    case 'range_1_10':
      return { min: 1, max: 10 }
    case 'decimal':
      return { min: 0, max: 10 }
    case 'custom_range': {
      const min = Number(cfg.customMin ?? 0)
      const max = Number(cfg.customMax ?? 100)
      if (Number.isNaN(min) || Number.isNaN(max) || max < min) return { min: 0, max: 100 }
      return { min, max }
    }
    case 'range_1_100':
    default:
      return { min: 1, max: 100 }
  }
}

// The range a judge types for a single minor criterion. Its score type is the
// authoritative source; custom_range falls back to its own min/max.
export function minorScoreBounds(minor) {
  const m = minor ?? {}
  switch (m.scoreType) {
    case 'range_1_10':
      return { min: 1, max: 10 }
    case 'decimal':
      return { min: 0, max: 10 }
    case 'custom_range':
      return { min: m.customMin ?? 0, max: m.customMax ?? 100 }
    case 'range_1_100':
    default:
      return { min: 1, max: 100 }
  }
}

export function scaleBoundsLabel({ min, max }) {
  return `${min}–${max}`
}

// Label for a minor criterion's range. For a custom_range with unset bounds,
// `placeholder` (e.g. '?') is shown in place of a numeric fallback so the UI can
// signal "not configured yet" rather than implying a real 0–100 range.
export function minorScoreLabel(minor, { placeholder = null } = {}) {
  const m = minor ?? {}
  if (m.scoreType === 'custom_range' && placeholder != null) {
    return `${m.customMin ?? placeholder}–${m.customMax ?? placeholder}`
  }
  return scaleBoundsLabel(minorScoreBounds(minor))
}
