import { useId, useState } from 'react'
import { INPUT_CLASS } from '@/utils/uiClasses'

// Multi-select chip list used for scope programs.
function CheckList({ options, selected, onToggle, empty, label }) {
  const [query, setQuery] = useState('')
  const filtered = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))

  if (!options.length) return <p className="v-caption">{empty}</p>
  return (
    <div className="space-y-2">
      {options.length > 8 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={INPUT_CLASS}
          placeholder={`Search ${label.toLowerCase()}`}
          aria-label={`Search ${label.toLowerCase()}`}
        />
      )}
      <div className="max-h-32 overflow-auto rounded-lg border border-v-border p-2">
        <div className="flex flex-wrap gap-1.5">
          {filtered.map((opt) => {
            const on = selected.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                aria-pressed={on}
                className={`rounded-md border px-2 py-1 text-xs transition ${
                  on ? 'border-v-primary bg-v-primary/10 text-v-text' : 'border-v-border text-v-text-muted hover:bg-v-surface-elevated'
                }`}
              >
                {opt}
              </button>
            )
          })}
          {filtered.length === 0 && <p className="v-caption p-1">No matching {label.toLowerCase()}.</p>}
        </div>
      </div>
    </div>
  )
}

/** True when a scoped selection is missing the program the backend requires. */
export function scopeIsIncomplete(value) {
  return value.scopeType === 'scoped' && value.programs.length === 0
}

/**
 * Controlled access-scope picker. `value` is { scopeType, programs }
 * (the same shape as users.scope); `programs` is the list of selectable programs.
 * Shared by the admin application review and the public application form.
 */
export default function AccessScopeFields({ value, onChange, programs = [], legend = 'Student access scope', help }) {
  const name = useId()
  const toggle = (key, item) => {
    const list = value[key]
    onChange({ ...value, [key]: list.includes(item) ? list.filter((v) => v !== item) : [...list, item] })
  }

  return (
    <fieldset className="space-y-3">
      <legend className="v-label">{legend}</legend>
      {help && <p className="v-caption">{help}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-2 text-sm text-v-text">
          <input
            type="radio"
            name={name}
            value="all"
            checked={value.scopeType === 'all'}
            onChange={() => onChange({ scopeType: 'all', programs: [] })}
            className="mt-1 accent-v-primary"
          />
          <span>
            <span className="block font-medium">All programs</span>
            <span className="v-caption">Broad access across the organization.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-v-text">
          <input
            type="radio"
            name={name}
            value="scoped"
            checked={value.scopeType === 'scoped'}
            onChange={() => onChange({ ...value, scopeType: 'scoped' })}
            className="mt-1 accent-v-primary"
          />
          <span>
            <span className="block font-medium">Selected programs</span>
            <span className="v-caption">Limit access to the programs you choose.</span>
          </span>
        </label>
      </div>

      {value.scopeType === 'scoped' && (
        <>
          <div>
            <p className="v-caption mb-1">Programs ({value.programs.length} selected)</p>
            <CheckList
              options={programs}
              selected={value.programs}
              onToggle={(v) => toggle('programs', v)}
              empty="No programs are defined yet. Ask an administrator to add them."
              label="Programs"
            />
          </div>
        </>
      )}
    </fieldset>
  )
}
