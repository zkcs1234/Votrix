// Readable download names: "<competition>-<round>-<kind>-<yyyy-mm-dd>.<ext>",
// for example "hiphop-battle-final-round-score-matrix-2026-11-21.xlsx".
// Replaces names built from internal ids ("competition-3f2a…-single-judge.csv").

export function slugify(text, max = 40) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
}

const pad = (n) => String(n).padStart(2, '0')

// The local calendar date, since that is the date the organizer sees.
export function dateStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function exportFileName({ competition, round, kind, ext, date = new Date() }) {
  const parts = [slugify(competition) || 'competition', slugify(round), kind, dateStamp(date)].filter(Boolean)
  return `${parts.join('-')}.${ext}`
}
