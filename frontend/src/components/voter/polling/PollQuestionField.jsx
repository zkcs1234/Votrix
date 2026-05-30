const TYPE_LABELS = {
  single_choice: 'Choose one',
  checkbox: 'Select all that apply',
  yes_no: 'Yes or no',
  text: 'Your answer',
  rating: 'Rate 1â€“5',
}

function isChoiceType(type) {
  return ['single_choice', 'yes_no', 'checkbox'].includes(type)
}

export default function PollQuestionField({ question, index, value, onChange, disabled }) {
  const q = question

  return (
    <section className="v-card p-6">
      <div className="flex flex-wrap justify-between gap-2">
        <p className="font-medium text-v-text">
          {index + 1}. {q.question}
          {q.required && <span className="text-v-danger"> *</span>}
        </p>
        <span className="text-xs text-v-text-subtle/80">{TYPE_LABELS[q.type] ?? q.type}</span>
      </div>

      {q.type === 'text' && (
        <textarea
          className="mt-4 v-input disabled:opacity-50"
          rows={4}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          required={q.required}
          placeholder="Type your answerâ€¦"
        />
      )}

      {q.type === 'rating' && (
        <div className="mt-4 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              className={`h-11 w-11 rounded-xl border text-sm font-medium transition disabled:opacity-50 ${
                Number(value) === n
                  ? 'border-v-text-muted bg-v-surface-elevated text-v-text'
                  : 'border-v-border-strong text-v-text-subtle hover:border-v-border-strong'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {q.type === 'checkbox' &&
        q.options?.map((o) => {
          const arr = Array.isArray(value) ? value : []
          return (
            <label
              key={o.id}
              className={`mt-3 flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${
                arr.includes(o.id)
                  ? 'border-v-text-muted bg-v-surface-elevated'
                  : 'border-v-border-strong hover:border-v-border-strong'
              }`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={arr.includes(o.id)}
                onChange={() => {
                  const next = arr.includes(o.id)
                    ? arr.filter((id) => id !== o.id)
                    : [...arr, o.id]
                  onChange(next)
                }}
              />
              <span className="text-v-text-muted">{o.label}</span>
            </label>
          )
        })}

      {isChoiceType(q.type) && q.type !== 'checkbox' &&
        q.options?.map((o) => (
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
              name={q.id}
              disabled={disabled}
              checked={value === o.id}
              onChange={() => onChange(o.id)}
              required={q.required}
            />
            <span className="text-v-text-muted">{o.label}</span>
          </label>
        ))}
    </section>
  )
}
