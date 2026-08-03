import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageUploadField from '@/components/upload/ImageUploadField'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Phase 7 — Question Builder is registry-driven. The list of available
// types comes from the API; we do not hardcode type names here.

const emptyForm = () => ({
  question: '',
  type: 'single_choice',
  required: true,
  typeConfig: {},
  options: [{ label: '', imageUrl: '' }, { label: '', imageUrl: '' }],
  imageUrl: '',
})

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

// Drag handle icon
function DragHandleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-v-text-subtle">
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="5" cy="8" r="1.5" />
      <circle cx="11" cy="8" r="1.5" />
      <circle cx="5" cy="13" r="1.5" />
      <circle cx="11" cy="13" r="1.5" />
    </svg>
  )
}

function SortableQuestionCard({ question, idx, types, onEdit, onDuplicate, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  }

  const q = question

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border border-v-border bg-v-surface p-5"
    >
      <div className="flex justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-1 cursor-grab touch-none rounded p-1 hover:bg-v-surface-elevated active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <DragHandleIcon />
          </button>
          <div>
            <span className="text-xs text-v-text-subtle">Q{idx + 1}</span>
            <p className="font-medium text-v-text">{q.question}</p>
            {q.imageUrl && (
              <img
                src={q.imageUrl}
                alt="Question image"
                className="mt-2 h-20 w-auto rounded-lg border border-v-border object-cover"
              />
            )}
            <p className="mt-1 text-xs text-v-text-muted/80">
              {types.find((t) => t.key === q.type)?.label ?? q.type}
              {q.required ? ' · Required' : ''}
            </p>
            {q.options?.length > 0 && (
              <ul className="mt-2 text-sm text-v-text-subtle">
                {q.options.map((o) => (
                  <li key={o.id} className="flex items-center gap-2">
                    <span>• {o.label}</span>
                    {o.imageUrl && (
                      <img
                        src={o.imageUrl}
                        alt={o.label}
                        className="inline-block h-6 w-6 rounded border border-v-border object-cover"
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onEdit(q)}
            className="text-sm text-v-text-muted"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(q.id)}
            className="text-sm text-v-text-muted"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => onDelete(q.id)}
            className="text-sm text-v-danger"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  )
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
    let isMounted = true
    Promise.all([
      pollingService.listQuestions(eventId),
      pollingService.listQuestionTypes(),
    ])
      .then(([qRes, tRes]) => {
        if (!isMounted) return
        setQuestions(qRes.data.questions ?? [])
        setTypes(tRes.data.types ?? [])
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => {
      isMounted = false
    }
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
          ? q.options.map((o) => ({ label: o.label, imageUrl: o.imageUrl ?? '' }))
          : [{ label: '', imageUrl: '' }, { label: '', imageUrl: '' }],
      imageUrl: q.imageUrl ?? '',
    })
  }

  const handleTypeChange = (typeKey) => {
    const next = { ...form, type: typeKey, typeConfig: {} }
    const def = types.find((t) => t.key === typeKey)
    if (def && needsFreeOptions(def) && form.options.length < 2) {
      next.options = [{ label: '', imageUrl: '' }, { label: '', imageUrl: '' }]
    }
    setForm(next)
  }

  const handleImageSelect = async (file, isOption = false, optionIndex = null) => {
    if (!file) {
      if (isOption) {
        const options = [...form.options]
        options[optionIndex] = { ...options[optionIndex], imageUrl: '' }
        setForm({ ...form, options })
      } else {
        setForm({ ...form, imageUrl: '' })
      }
      return
    }
    try {
      const { data } = await pollingService.uploadGenericImage(eventId, file)
      if (isOption) {
        const options = [...form.options]
        options[optionIndex] = { ...options[optionIndex], imageUrl: data.url }
        setForm({ ...form, options })
      } else {
        setForm({ ...form, imageUrl: data.url })
      }
    } catch (err) {
      setError('Failed to upload image')
    }
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
      imageUrl: form.imageUrl || null,
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
      payload.options = options.map((o) => ({
        label: o.label.trim(),
        imageUrl: o.imageUrl?.trim() || null,
      }))
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

  const handleDuplicate = async (id) => {
    try {
      await pollingService.duplicateQuestion(eventId, id)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to duplicate question')
    }
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = questions.findIndex((q) => q.id === active.id)
    const newIndex = questions.findIndex((q) => q.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Optimistic reorder
    const reordered = [...questions]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    setQuestions(reordered)

    // Persist new sort_order
    const orders = reordered.map((q, i) => ({ id: q.id, sortOrder: i }))
    try {
      await pollingService.reorderQuestions(eventId, orders)
      load()
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reorder')
      load() // revert
    }
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

        {/* Question image */}
        <div>
          <ImageUploadField
            label="Question image (optional)"
            variant="photo"
            currentUrl={form.imageUrl}
            onFileSelect={(file) => handleImageSelect(file, false)}
            disabled={saving}
          />
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
              <div key={i} className="space-y-1">
                <div className="flex gap-2">
                  <input
                    className={INPUT_CLASS}
                    placeholder={`Option ${i + 1}`}
                    value={opt.label}
                    onChange={(e) => {
                      const options = [...form.options]
                      options[i] = { ...options[i], label: e.target.value }
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
                <div className="mt-2 w-48">
                  <ImageUploadField
                    hint="Option image (optional)"
                    variant="photo"
                    currentUrl={opt.imageUrl}
                    onFileSelect={(file) => handleImageSelect(file, true, i)}
                    disabled={saving}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              className="text-sm text-v-text-muted"
              onClick={() => setForm({ ...form, options: [...form.options, { label: '', imageUrl: '' }] })}
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-3">
            {questions.map((q, idx) => (
              <SortableQuestionCard
                key={q.id}
                question={q}
                idx={idx}
                types={types}
                onEdit={startEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            ))}
            {!questions.length && (
              <p className="text-sm text-v-text-subtle">No questions yet. Add your first question above.</p>
            )}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}

