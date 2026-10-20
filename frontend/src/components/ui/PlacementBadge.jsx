import './PlacementBadge.css'

const suffixFor = rank => {
  const lastTwo = rank % 100
  if (lastTwo >= 11 && lastTwo <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' })[rank % 10] ?? 'th'
}

export default function PlacementBadge({ rank, tied = false }) {
  const numericRank = Number(rank)
  if (!Number.isInteger(numericRank) || numericRank < 1) return rank ?? '—'
  const tone = numericRank === 1 ? 'first' : numericRank === 2 ? 'second' : numericRank === 3 ? 'third' : 'other'

  return (
    <span
      className="v-placement-badge"
      data-placement={tone}
      aria-label={`${numericRank}${suffixFor(numericRank)} place${tied ? ', tied' : ''}`}
      title={`${numericRank}${suffixFor(numericRank)} place${tied ? ' (tie)' : ''}`}
    >
      {numericRank}{tied && <small>(tie)</small>}
    </span>
  )
}
