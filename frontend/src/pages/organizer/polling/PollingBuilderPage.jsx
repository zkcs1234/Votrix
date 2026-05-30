import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService, QUESTION_TYPES } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

function apiTypeToForm(type) {
  return type === 'single_choice' ? 'multiple_choice' : type
}

function needsOptions(type) {
  return ['multiple_choice', 'checkbox'].includes(type)
}

const emptyForm = () => ({
  question: '',
  type: 'multiple_choice',
  required: true,
  options: [{ label: '' }, { label: '' }],
})

export default function PollingBuilderPage() {
  const { eventId } = useParams()
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = () => {
    pollingService
      .listQuestions(eventId)
      .then(({ data }) => setQuestions(data.questions ?? []))
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
      type: apiTypeToForm(q.type),
      required: q.required,
      options:
        q.options?.length > 0
          ? q.options.map((o) => ({ label: o.label }))
          : [{ label: '' }, { label: '' }],
    })
  }

  const handleTypeChange = (type) => {
    const next = { ...form, type }
    if (needsOptions(type) && form.options.length < 2) {
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
      sortOrder: editingId
        ? questions.find((q) => q.id === editingId)?.sortOrder ?? 0
        : questions.length,
    }

    if (needsOptions(form.type)) {
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

        <input
          className={inputClass}
          placeholder="Question text"
          value={form.question}
          onChange={(e) => setForm({ ...form, question: e.target.value })}
          required
        />

        <select
          className={inputClass}
          value={form.type}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        {needsOptions(form.type) && (
          <div className="space-y-2">
            <p className="text-xs text-v-text-subtle">Options</p>
            {form.options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputClass}
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

        {form.type === 'yes_no' && (
          <p className="text-xs text-v-text-subtle">Yes / No options are created automatically.</p>
        )}

        {form.type === 'rating' && (
          <p className="text-xs text-v-text-subtle">Respondents rate from 1 to 5 stars.</p>
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
                  {QUESTION_TYPES.find((t) => t.value === apiTypeToForm(q.type))?.label ?? q.type}
                  {q.required ? ' Â· Required' : ''}
                </p>
                {q.options?.length > 0 && (
                  <ul className="mt-2 text-sm text-v-text-subtle">
                    {q.options.map((o) => (
                      <li key={o.id}>â€¢ {o.label}</li>
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
