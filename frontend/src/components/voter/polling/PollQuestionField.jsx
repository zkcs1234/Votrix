// Phase 7 — Registry-driven poll question field. The `question.typeDef`
// (loaded from the backend) decides which input renders. Adding a new
// question type is a single SQL insert and (optionally) a new branch here.
export default function PollQuestionField({ question, index, value, onChange, disabled }) {
  const q = question
  const def = q.typeDef
  const input = def?.ui?.input ?? 'unknown'

  return (
    <section className="v-card p-6">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="font-medium text-v-text">
          {index + 1}. {q.question}
          {q.required && <span className="text-v-danger"> *</span>}
        </p>
        <span className="text-xs text-v-text-subtle/80">
          {def?.label ?? q.type}
        </span>
      </div>

      {input === 'textarea' && (
        <textarea
          className="mt-4 v-input disabled:opacity-50"
          rows={4}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={q.required}
          placeholder="Type your answer…"
        />
      )}

      {input === 'rating' && (
        <RatingInput
          min={q.typeConfig?.min ?? 1}
          max={q.typeConfig?.max ?? 5}
          step={q.typeConfig?.step ?? 1}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
        />
      )}

      {input === 'likert' && (
        <LikertInput
          options={q.options}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
        />
      )}

      {input === 'checkbox' && (
        <CheckboxInput
          options={q.options}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
        />
      )}

      {input === 'ranking' && (
        <RankingInput
          options={q.options}
          value={value ?? {}}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
        />
      )}

      {input === 'radio' && (
        <RadioInput
          options={q.options}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
        />
      )}

      {!['textarea', 'rating', 'likert', 'checkbox', 'ranking', 'radio'].includes(input) && (
        <p className="mt-4 text-sm text-v-text-subtle">
          This question uses an unsupported input type ({input}). Please contact the organizer.
        </p>
      )}
    </section>
  )
}

function RadioInput({ options, value, onChange, disabled, required }) {
  return (
    <div>
      {options?.map((o) => (
        <label
          key={o.id}
          className={`mt-3 flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
            value === o.id
              ? 'border-v-text-muted bg-v-surface-elevated'
              : 'border-v-border-strong hover:border-v-border-strong'
          }`}
        >
          <input
            type="radio"
            disabled={disabled}
            checked={value === o.id}
            onChange={() => onChange(o.id)}
            required={required}
          />
          <span className="text-v-text-muted">{o.label}</span>
        </label>
      ))}
    </div>
  )
}

function CheckboxInput({ options, value, onChange, disabled }) {
  return (
    <div>
      {options?.map((o) => (
        <label
          key={o.id}
          className={`mt-3 flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
            value.includes(o.id)
              ? 'border-v-text-muted bg-v-surface-elevated'
              : 'border-v-border-strong hover:border-v-border-strong'
          }`}
        >
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.includes(o.id)}
            onChange={() => {
              const next = value.includes(o.id)
                ? value.filter((id) => id !== o.id)
                : [...value, o.id]
              onChange(next)
            }}
          />
          <span className="text-v-text-muted">{o.label}</span>
        </label>
      ))}
    </div>
  )
}

function RatingInput({ min, max, step, value, onChange, disabled, required }) {
  const values = []
  for (let n = min; n <= max; n += step) {
    values.push(Number(n.toFixed(4)))
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {values.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`h-11 min-w-11 rounded-xl border px-3 text-sm font-medium transition disabled:opacity-50 ${
            Number(value) === n
              ? 'border-v-text-muted bg-v-surface-elevated text-v-text'
              : 'border-v-border-strong text-v-text-subtle hover:border-v-border-strong'
          }`}
        >
          {n}
        </button>
      ))}
      <input type="hidden" required={required} value={value ?? ''} />
    </div>
  )
}

function LikertInput({ options, value, onChange, disabled, required }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {options?.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={`rounded-xl border px-2 py-3 text-xs transition disabled:opacity-50 ${
            value === o.id
              ? 'border-v-text-muted bg-v-surface-elevated text-v-text'
              : 'border-v-border-strong text-v-text-subtle hover:border-v-border-strong'
          }`}
        >
          {o.label}
        </button>
      ))}
      <input type="hidden" required={required} value={value ?? ''} />
    </div>
  )
}

function RankingInput({ options, value, onChange, disabled }) {
  // value shape: { [optionId]: rank }
  const sorted = [...(options ?? [])].sort((a, b) => {
    const ra = value[a.id] ?? Number.POSITIVE_INFINITY
    const rb = value[b.id] ?? Number.POSITIVE_INFINITY
    return ra - rb
  })

  const setRank = (id, delta) => {
    if (disabled) return
    const next = { ...value }
    const current = next[id] ?? options.length
    const proposed = Math.max(1, Math.min(options.length, current + delta))
    next[id] = proposed
    onChange(next)
  }

  return (
    <ol className="mt-4 space-y-2">
      {sorted.map((o, i) => {
        const rank = value[o.id] ?? '—'
        return (
          <li
            key={o.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-v-border-strong bg-v-surface px-4 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-center text-v-text-muted">{i + 1}</span>
              <span className="text-v-text">{o.label}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setRank(o.id, -1)}
                className="rounded border border-v-border-strong px-2 text-v-text-muted disabled:opacity-50"
              >
                −
              </button>
              <span className="w-8 text-center text-v-text-muted">#{rank}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setRank(o.id, +1)}
                className="rounded border border-v-border-strong px-2 text-v-text-muted disabled:opacity-50"
              >
                +
              </button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
