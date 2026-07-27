// Phase 7 — Registry-driven poll question field. The `question.typeDef`
// (loaded from the backend) decides which input renders. Adding a new
// question type is a single SQL insert and (optionally) a new branch here.
export default function PollQuestionField({ question, index, value, onChange, disabled }) {
  const q = question
  const def = q.typeDef
  const input = def?.ui?.input ?? 'unknown'

  return (
    <fieldset className="v-card p-6 border-0">
      <legend className="sr-only">
        Question {index + 1}: {q.question}
        {q.required ? ' (required)' : ''}
      </legend>
      <div className="flex flex-wrap justify-between gap-2">
        <p className="font-medium text-v-text">
          {index + 1}. {q.question}
          {q.required && <span className="text-v-danger"> *</span>}
        </p>
        <span className="text-xs text-v-text-subtle/80">
          {def?.label ?? q.type}
        </span>
      </div>

      {q.imageUrl && (
        <img
          src={q.imageUrl}
          alt={`Image for question: ${q.question}`}
          className="mt-3 max-h-48 w-auto rounded-xl border border-v-border object-cover"
          loading="lazy"
        />
      )}

      {input === 'textarea' && (
        <textarea
          className="mt-4 v-input disabled:opacity-50"
          rows={4}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          aria-required={q.required}
          aria-label={q.question}
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
          questionLabel={q.question}
        />
      )}

      {input === 'likert' && (
        <LikertInput
          options={q.options}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
          questionLabel={q.question}
        />
      )}

      {input === 'checkbox' && (
        <CheckboxInput
          options={q.options}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
          questionLabel={q.question}
        />
      )}

      {input === 'ranking' && (
        <RankingInput
          options={q.options}
          value={value ?? {}}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
          questionLabel={q.question}
        />
      )}

      {input === 'radio' && (
        <RadioInput
          options={q.options}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={q.required}
          questionLabel={q.question}
        />
      )}

      {!['textarea', 'rating', 'likert', 'checkbox', 'ranking', 'radio'].includes(input) && (
        <p className="mt-4 text-sm text-v-text-subtle">
          This question uses an unsupported input type ({input}). Please contact the organizer.
        </p>
      )}
    </fieldset>
  )
}

function RadioInput({ options, value, onChange, disabled, required, questionLabel }) {
  return (
    <div role="radiogroup" aria-label={`Options for ${questionLabel}`}>
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
            aria-required={required}
          />
          <span className="text-v-text-muted">{o.label}</span>
          {o.imageUrl && (
            <img
              src={o.imageUrl}
              alt={o.label}
              className="ml-auto h-10 w-10 rounded-lg border border-v-border object-cover"
              loading="lazy"
            />
          )}
        </label>
      ))}
    </div>
  )
}

function CheckboxInput({ options, value, onChange, disabled, questionLabel }) {
  return (
    <div role="group" aria-label={`Options for ${questionLabel}`}>
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
          {o.imageUrl && (
            <img
              src={o.imageUrl}
              alt={o.label}
              className="ml-auto h-10 w-10 rounded-lg border border-v-border object-cover"
              loading="lazy"
            />
          )}
        </label>
      ))}
    </div>
  )
}

function RatingInput({ min, max, step, value, onChange, disabled, required, questionLabel }) {
  const values = []
  for (let n = min; n <= max; n += step) {
    values.push(Number(n.toFixed(4)))
  }
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={`Rating for ${questionLabel}`}>
      {values.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          aria-pressed={Number(value) === n}
          aria-label={`Rate ${n}`}
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

function LikertInput({ options, value, onChange, disabled, required, questionLabel }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5" role="radiogroup" aria-label={`Scale for ${questionLabel}`}>
      {options?.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
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

function RankingInput({ options, value, onChange, disabled, questionLabel }) {
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
    <ol className="mt-4 space-y-2" aria-label={`Ranking for ${questionLabel}`}>
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
            <div className="flex items-center gap-2 text-sm" role="group" aria-label={`Rank controls for ${o.label}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setRank(o.id, -1)}
                aria-label={`Move ${o.label} up`}
                className="rounded border border-v-border-strong px-2 text-v-text-muted disabled:opacity-50"
              >
                −
              </button>
              <span className="w-8 text-center text-v-text-muted" aria-live="polite">#{rank}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setRank(o.id, +1)}
                aria-label={`Move ${o.label} down`}
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

