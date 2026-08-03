import CandidateVoteControl from '@/components/voter/election/CandidateVoteControl'

export default function ElectionPositionSection({
  position,
  selectedIds,
  onToggle,
  disabled,
}) {
  const selected = selectedIds ?? []
  // Single select when maxVote is 1 (no minVote concept)
  const isSingleSelect = position.maxVote === 1

  return (
    <section className="v-card p-6" aria-labelledby={`pos-heading-${position.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`pos-heading-${position.id}`} className="font-medium text-v-text">
            {position.name}
          </h3>
          <p className="mt-1 text-xs text-v-text-subtle">
            Select{' '}
            {position.maxVote}{' '}
            candidate{position.maxVote !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div
        className="mt-4 space-y-2"
        role={isSingleSelect ? 'radiogroup' : 'group'}
        aria-labelledby={`pos-heading-${position.id}`}
      >
        {position.candidates.map((candidate) => (
          <CandidateVoteControl
            key={candidate.id}
            candidate={candidate}
            positionName={position.name}
            selected={selected.includes(candidate.id)}
            disabled={disabled}
            onToggle={() => onToggle(position.id, candidate.id, position.maxVote)}
          />
        ))}
        {!position.candidates.length && (
          <p className="text-sm text-v-text-subtle">No candidates for this position.</p>
        )}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {selected.length > 0 && (
          <p className="mt-3 text-xs text-v-text-muted font-medium">
            {selected.length} selected
            {position.maxVote > 1 ? ` (max ${position.maxVote})` : ''}
          </p>
        )}
      </div>
    </section>
  )
}
