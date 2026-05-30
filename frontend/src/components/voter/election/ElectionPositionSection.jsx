import CandidateVoteControl from '@/components/voter/election/CandidateVoteControl'

export default function ElectionPositionSection({
  position,
  selectedIds,
  isSkipped,
  onToggle,
  onSkip,
  disabled,
}) {
  const selected = selectedIds ?? []
  const skipped = Boolean(isSkipped)

  return (
    <section className="v-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-v-text">{position.name}</h3>
          <p className="mt-1 text-xs text-v-text-subtle">
            Select{' '}
            {position.minVote === position.maxVote
              ? position.minVote
              : `${position.minVote}â€“${position.maxVote}`}{' '}
            candidate{position.maxVote !== 1 ? 's' : ''}
            {position.allowSkip ? ' Â· or skip this position' : ''}
          </p>
        </div>
        {position.allowSkip && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSkip(position.id)}
            className={`rounded-lg border px-3 py-1 text-xs ${
              skipped
                ? 'border-amber-600 bg-amber-950/40 text-amber-300'
                : 'border-v-border-strong text-v-text-subtle hover:border-v-border-strong'
            }`}
          >
            {skipped ? 'Skipped' : 'Skip position'}
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {position.candidates.map((candidate) => (
          <CandidateVoteControl
            key={candidate.id}
            candidate={candidate}
            selected={selected.includes(candidate.id)}
            disabled={disabled || skipped}
            onToggle={() => onToggle(position.id, candidate.id, position.maxVote)}
          />
        ))}
        {!position.candidates.length && (
          <p className="text-sm text-v-text-subtle">No candidates for this position.</p>
        )}
      </div>

      {selected.length > 0 && (
        <p className="mt-3 text-xs text-v-text-muted">
          {selected.length} selected
          {position.maxVote > 1 ? ` (max ${position.maxVote})` : ''}
        </p>
      )}
    </section>
  )
}
