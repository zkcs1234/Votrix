export default function CandidateVoteControl({ candidate, selected, disabled, onToggle, positionName = '' }) {
  // Prefer the new spec field name `party`; fall back to legacy `partylist`.
  const party = candidate.party ?? candidate.partylist
  const blurb = candidate.platform || candidate.biography || candidate.description
  const label = selected
    ? `Selected: ${candidate.name}${party ? `, ${party}` : ''}${positionName ? ` for ${positionName}` : ''}`
    : `Select ${candidate.name}${party ? `, ${party}` : ''}${positionName ? ` for ${positionName}` : ''}`

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(selected)}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-v-primary ${
        selected
          ? 'border-v-text bg-v-surface-elevated ring-1 ring-v-border'
          : 'border-v-border-strong hover:border-v-border-strong'
      }`}
    >
      {candidate.photo ? (
        <img
          src={candidate.photo}
          alt={`Photo of ${candidate.name}`}
          className="h-14 w-14 rounded-lg object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-14 w-14 items-center justify-center rounded-lg bg-v-surface-elevated text-lg text-v-text-subtle font-medium"
        >
          {candidate.name?.charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-v-text">{candidate.name}</p>
        {party && <p className="text-xs text-v-text-subtle">{party}</p>}
        {blurb && (
          <p className="mt-0.5 text-xs text-v-text-subtle line-clamp-2">{blurb}</p>
        )}
      </div>
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
          selected ? 'border-v-primary bg-v-primary text-white' : 'border-v-border-strong'
        }`}
      >
        {selected && '✓'}
      </span>
    </button>
  )
}
