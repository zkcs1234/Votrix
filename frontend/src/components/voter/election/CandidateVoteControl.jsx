export default function CandidateVoteControl({ candidate, selected, disabled, onToggle }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${
        selected
          ? 'border-v-text bg-v-surface-elevated ring-1 ring-v-border'
          : 'border-v-border-strong hover:border-v-border-strong'
      }`}
    >
      {candidate.photo ? (
        <img src={candidate.photo} alt="" className="h-14 w-14 rounded-lg object-cover" />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-v-surface-elevated text-lg text-v-text-subtle">
          {candidate.name?.charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-v-text">{candidate.name}</p>
        {candidate.partylist && <p className="text-xs text-v-text-subtle">{candidate.partylist}</p>}
        {candidate.description && (
          <p className="mt-0.5 text-xs text-v-text-subtle line-clamp-2">{candidate.description}</p>
        )}
      </div>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-v-primary bg-v-primary text-white' : 'border-v-border-strong'
        }`}
      >
        {selected && 'âœ“'}
      </span>
    </button>
  )
}
