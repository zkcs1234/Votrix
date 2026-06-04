import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

// Phase 7 — Question Builder is registry-driven. The list of available
// types comes from the API; we do not hardcode type names here.

const emptyForm = () => ({
  question: '',
  type: 'single_choice',
  required: true,
  typeConfig: {},
  options: [{ label: '' }, { label: '' }],
})

const ui = {
  radio: 'Single choice (radio buttons)',
  checkbox: 'Multiple selection (checkboxes)',
  textarea: 'Open text',
  rating: 'Numeric rating',
  likert: 'Likert scale',
  ranking: 'Ranking (drag to order)',
}

function needsFreeOptions(typeDef) {
  if (!typeDef) return true
  const input = typeDef.ui?.input
  if (input === 'radio' || input === 'checkbox' || input === 'ranking') return true
  return false
}

function isAutoOptionsType(typeDef) {
  return Boolean(typeDef?.ui?.autoOptions)
}

function configFieldFor(typeDef) {
  // Returns an array of { key, label, kind, value, options } for the
  // fields we want to render for this type. Kept in the UI for clarity —
  // the engine on the server does the same with configSchema.
  if (!typeDef) return []
  switch (typeDef.answerFormat?.kind) {
    case 'numeric':
      return [
        { key: 'min', label: 'Min', kind: 'number' },
        { key: 'max', label: 'Max', kind: 'number' },
        { key: 'step', label: 'Step', kind: 'number' },
      ]
    case 'text':
      return [
        { key: 'maxLength', label: 'Max length', kind: 'number' },
        { key: 'multiline', label: 'Multiline', kind: 'boolean' },
      ]
    case 'ranking':
      return [
        { key: 'allowTies', label: 'Allow ties', kind: 'boolean' },
        { key: 'minItems', label: 'Min items to rank', kind: 'number' },
      ]
    default:
      return []
  }
}

export default function PollingBuilderPage() {
  const { eventId } = useParams()
  const [questions, setQuestions] = useState([])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const currentTypeDef = useMemo(
    () => types.find((t) => t.key === form.type) ?? null,
    [types, form.type],
  )

  const load = () => {
    Promise.all([
      pollingService.listQuestions(eventId),
      pollingService.listQuestionTypes(),
    ])
      .then(([qRes, tRes]) => {
        setQuestions(qRes.data.questions ?? [])
        setTypes(tRes.data.types ?? [])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [eventId])

  const resetForm = () => {
    setForm(emptyForm())
    setEditingId(null)
    setError(null)
  }

  const startEdit = (q) => {
    setEditingId(q.id)
    setForm({
      question: q.question,
      type: q.type,
      required: q.required,
      typeConfig: q.typeConfig ?? {},
      options:
        q.options?.length > 0
          ? q.options.map((o) => ({ label: o.label }))
          : [{ label: '' }, { label: '' }],
    })
  }

  const handleTypeChange = (typeKey) => {
    const next = { ...form, type: typeKey, typeConfig: {} }
    const def = types.find((t) => t.key === typeKey)
    if (def && needsFreeOptions(def) && form.options.length < 2) {
      next.options = [{ label: '' }, { label: '' }]
    }
    setForm(next)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      question: form.question,
      type: form.type,
      required: form.required,
      typeConfig: form.typeConfig,
      sortOrder: editingId
        ? questions.find((q) => q.id === editingId)?.sortOrder ?? 0
        : questions.length,
    }

    if (needsFreeOptions(currentTypeDef)) {
      const options = form.options.filter((o) => o.label.trim())
      if (options.length < 2) {
        setError('Add at least two options')
        setSaving(false)
        return
      }
      payload.options = options.map((o) => ({ label: o.label.trim() }))
    }

    try {
      if (editingId) {
        await pollingService.updateQuestion(eventId, editingId, payload)
      } else {
        await pollingService.createQuestion(eventId, payload)
      }
      resetForm()
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save question')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this question?')) return
    await pollingService.deleteQuestion(eventId, id)
    load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-v-text">Poll builder</h2>

      <form onSubmit={handleSubmit} className="v-card p-6 space-y-4">
        <h3 className="text-sm font-medium text-v-text-muted">
          {editingId ? 'Edit question' : 'Add question'}
        </h3>

        <div>
          <label className={LABEL_CLASS}>Question text</label>
          <input
            className={INPUT_CLASS}
            placeholder="Question text"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            required
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Question type</label>
          <select
            className={INPUT_CLASS}
            value={form.type}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          {currentTypeDef?.description && (
            <p className="mt-1 text-xs text-v-text-subtle">
              {currentTypeDef.description}
            </p>
          )}
        </div>

        {/* Per-type config — rendered dynamically from configSchema. */}
        {configFieldFor(currentTypeDef).map((f) => (
          <div key={f.key} className="grid grid-cols-2 gap-2">
            <label className={LABEL_CLASS}>{f.label}</label>
            {f.kind === 'boolean' ? (
              <input
                type="checkbox"
                checked={Boolean(form.typeConfig?.[f.key])}
                onChange={(e) =>
                  setForm({
                    ...form,
                    typeConfig: { ...form.typeConfig, [f.key]: e.target.checked },
                  })
                }
              />
            ) : (
              <input
                type="number"
                step="any"
                className={INPUT_CLASS}
                value={form.typeConfig?.[f.key] ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    typeConfig: {
                      ...form.typeConfig,
                      [f.key]: e.target.value === '' ? undefined : Number(e.target.value),
                    },
                  })
                }
              />
            )}
          </div>
        ))}

        {isAutoOptionsType(currentTypeDef) && (
          <p className="text-xs text-v-text-subtle">
            Options are generated automatically for this type.
          </p>
        )}

        {needsFreeOptions(currentTypeDef) && (
          <div className="space-y-2">
            <p className="text-xs text-v-text-subtle">Options</p>
            {form.options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={INPUT_CLASS}
                  placeholder={`Option ${i + 1}`}
                  value={opt.label}
                  onChange={(e) => {
                    const options = [...form.options]
                    options[i] = { label: e.target.value }
                    setForm({ ...form, options })
                  }}
                />
                {form.options.length > 2 && (
                  <button
                    type="button"
                    className="text-v-danger text-sm"
                    onClick={() =>
                      setForm({
                        ...form,
                        options: form.options.filter((_, idx) => idx !== i),
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-v-text-muted"
              onClick={() => setForm({ ...form, options: [...form.options, { label: '' }] })}
            >
              + Add option
            </button>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-v-text-muted">
          <input
            type="checkbox"
            checked={form.required}
            onChange={(e) => setForm({ ...form, required: e.target.checked })}
          />
          Required
        </label>

        {error && <p className="text-sm text-v-danger">{error}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-v-primary px-5 py-2 text-white hover:bg-v-primary-hover disabled:opacity-60"
          >
            {editingId ? 'Update' : 'Add question'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-v-text-subtle">
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className="space-y-3">
        {questions.map((q, idx) => (
          <li
            key={q.id}
            className="rounded-2xl border border-v-border bg-v-surface p-5"
          >
            <div className="flex justify-between gap-4">
              <div>
                <span className="text-xs text-v-text-subtle">Q{idx + 1}</span>
                <p className="font-medium text-v-text">{q.question}</p>
                <p className="mt-1 text-xs text-v-text-muted/80">
                  {types.find((t) => t.key === q.type)?.label ?? q.type}
                  {q.required ? ' · Required' : ''}
                </p>
                {q.options?.length > 0 && (
                  <ul className="mt-2 text-sm text-v-text-subtle">
                    {q.options.map((o) => (
                      <li key={o.id}>• {o.label}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(q)}
                  className="text-sm text-v-text-muted"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(q.id)}
                  className="text-sm text-v-danger"
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
        {!questions.length && (
          <p className="text-sm text-v-text-subtle">No questions yet. Add your first question above.</p>
        )}
      </ul>
    </div>
  )
}
