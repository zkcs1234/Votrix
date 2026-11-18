import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import api from '@/services/api'
import { pollingService } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageUploadField from '@/components/upload/ImageUploadField'
import ManagementWorkspace from '@/components/ui/ManagementWorkspace'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import useEventStatus from '@/hooks/useEventStatus'
import FormField from '@/components/ui/FormField'
import { LABEL_CLASS } from '@/utils/uiClasses'
import {
  configFieldFor,
  hasQuestionErrors,
  needsFreeOptions,
  validateQuestionForm,
} from '@/utils/pollQuestionValidation'
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
  options: [{ label: '', imageUrl: '', imageAssetId: null }, { label: '', imageUrl: '', imageAssetId: null }],
  imageUrl: '',
  imageAssetId: null,
})

function listQuestionTypes() {
  return api.get('/organizer/polling/question-types')
}

function isAutoOptionsType(typeDef) {
  return Boolean(typeDef?.ui?.autoOptions)
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

function SortableQuestionCard({ question, idx, types, onEdit, onDuplicate, onDelete, locked = false }) {
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
      className="v-card-md p-5"
    >
      <div className="flex justify-between gap-4">
        <div className="flex items-start gap-3">
          {!locked && (
          <button
            type="button"
            className="mt-1 cursor-grab touch-none rounded p-1 hover:bg-v-surface-elevated active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <DragHandleIcon />
          </button>
          )}
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
        {!locked && (
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
        )}
      </div>
    </li>
  )
}

export default function PollingBuilderPage() {
  const { eventId } = useParams()
  const { status, setupLocked } = useEventStatus(pollingService, eventId)
  const [questions, setQuestions] = useState([])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm())
  const [formKey, setFormKey] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  // Image uploads in flight, per-slot failures, and keys that reset an upload field
  // (its local preview) after a failed upload.
  const [uploading, setUploading] = useState(0)
  const [uploadErrors, setUploadErrors] = useState({})
  const [imageResets, setImageResets] = useState({})
  const [error, setError] = useState(null)
  // Fields the organizer has left at least once; their messages show from then on, live.
  const [touched, setTouched] = useState({})

  const currentTypeDef = useMemo(
    () => types.find((t) => t.key === form.type) ?? null,
    [types, form.type],
  )

  const errors = useMemo(() => validateQuestionForm(form, currentTypeDef), [form, currentTypeDef])
  const touch = (key) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))
  const shown = (key, message) => (touched[key] || touched.all ? message : undefined)
  const formInvalid = hasQuestionErrors(errors)
  // Why "Add question" is unavailable (null when it is available).
  let blockedReason = null
  if (formInvalid) {
    blockedReason =
      errors.question && !touched.question && !Object.keys(touched).length
        ? 'Enter the question text to continue.'
        : 'Fix the highlighted fields to continue.'
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const load = () => {
    Promise.all([
      pollingService.listQuestions(eventId),
      listQuestionTypes(),
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
      listQuestionTypes(),
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
    setTouched({})
    setFormKey((k) => k + 1)
  }

const startEdit = (q) => {
    setTouched({})
    setEditingId(q.id)
    setFormKey((k) => k + 1)
    setForm({
      question: q.question,
      type: q.type,
      required: q.required,
      typeConfig: q.typeConfig ?? {},
      options:
        q.options?.length > 0
          ? q.options.map((o) => ({
              label: o.label,
              imageUrl: o.imageUrl ?? '',
              imageAssetId: o.imageAssetId ?? null,
            }))
          : [{ label: '', imageUrl: '', imageAssetId: null }, { label: '', imageUrl: '', imageAssetId: null }],
      imageUrl: q.imageUrl ?? '',
      imageAssetId: q.imageAssetId ?? null,
    })
  }

const handleTypeChange = (typeKey) => {
    const next = { ...form, type: typeKey, typeConfig: {} }
    const def = types.find((t) => t.key === typeKey)
    if (def && needsFreeOptions(def) && form.options.length < 2) {
      next.options = [{ label: '', imageUrl: '', imageAssetId: null }, { label: '', imageUrl: '', imageAssetId: null }]
    }
    setForm(next)
  }

  // Slots: 'question' for the question image, `option-${index}` for an option.
  const applyImage = (isOption, optionIndex, imageUrl, imageAssetId) => {
    // Functional update: the upload takes a while, and the typed text or another
    // option's image may have changed meanwhile. Writing back a stale copy of the
    // form would silently drop those edits.
    setForm((current) => {
      if (!isOption) return { ...current, imageUrl, imageAssetId }
      const options = [...current.options]
      if (!options[optionIndex]) return current
      options[optionIndex] = { ...options[optionIndex], imageUrl, imageAssetId }
      return { ...current, options }
    })
  }

  const handleImageSelect = async (file, isOption = false, optionIndex = null) => {
    const slot = isOption ? `option-${optionIndex}` : 'question'
    setUploadErrors((prev) => ({ ...prev, [slot]: null }))
    if (!file) {
      applyImage(isOption, optionIndex, '', null)
      return
    }
    setUploading((count) => count + 1)
    try {
      const { data } = await pollingService.uploadGenericImage(eventId, file)
      if (!data?.url) throw new Error('No image URL returned')
      applyImage(isOption, optionIndex, data.url, data.image_asset_id ?? null)
    } catch (err) {
      // The field already showed a local preview of the chosen file, which would
      // look like a saved image. Say it failed and reset the field so it doesn't.
      setUploadErrors((prev) => ({
        ...prev,
        [slot]: err.response?.data?.message || 'The image could not be uploaded. Choose it again.',
      }))
      setImageResets((prev) => ({ ...prev, [slot]: (prev[slot] ?? 0) + 1 }))
    } finally {
      setUploading((count) => count - 1)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Saving before an upload finishes would store the question without its image.
    if (uploading > 0) return
    if (formInvalid) {
      // The button is disabled, but Enter can still submit: reveal every message.
      setTouched({ question: true, options: true, all: true })
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      question: form.question,
      type: form.type,
      required: form.required,
      typeConfig: form.typeConfig,
      imageUrl: form.imageUrl || null,
      imageAssetId: form.imageAssetId ?? null,
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
        imageAssetId: o.imageAssetId ?? null,
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
    <div data-module="polling" className="mx-auto max-w-7xl">
    <ManagementWorkspace
      title="Poll builder"
      subtitle="Create, configure, and reorder the questions respondents will answer."
      formPanel={
        setupLocked ? (
          <ReadOnlyEventBanner status={status} noun="poll" />
        ) : (
        <form key={formKey} onSubmit={handleSubmit} className="v-card-md mb-4 space-y-4">
        <h3 className="v-section-title">
          {editingId ? 'Edit question' : 'Add question'}
        </h3>

        <FormField label="Question text" required error={shown('question', errors.question)}>
          {(field) => (
            <input
              {...field}
              placeholder="Question text"
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              onBlur={touch('question')}
            />
          )}
        </FormField>

        <FormField label="Question type" hint={currentTypeDef?.description}>
          {(field) => (
            <select {...field} value={form.type} onChange={(e) => handleTypeChange(e.target.value)}>
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {/* Question image */}
        <div>
          <ImageUploadField
            key={`question-${imageResets.question ?? 0}`}
            label="Question image (optional)"
            variant="photo"
            currentUrl={form.imageUrl}
            onFileSelect={(file) => handleImageSelect(file, false)}
            disabled={saving}
          />
          {uploadErrors.question && <p role="alert" className="mt-1 text-sm text-v-danger">{uploadErrors.question}</p>}
        </div>

        {/* Per-type config — rendered dynamically from configSchema. */}
        {configFieldFor(currentTypeDef).map((f) =>
          f.kind === 'boolean' ? (
            <div key={f.key} className="grid grid-cols-2 gap-2">
              <label className={LABEL_CLASS}>{f.label}</label>
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
            </div>
          ) : (
            <FormField key={f.key} label={f.label} error={shown(`config.${f.key}`, errors.config[f.key])}>
              {(field) => (
                <input
                  {...field}
                  type="number"
                  step="any"
                  value={form.typeConfig?.[f.key] ?? ''}
                  onBlur={touch(`config.${f.key}`)}
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
            </FormField>
          ),
        )}

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
                <div className="flex items-start gap-2">
                  <FormField
                    className="min-w-0 flex-1"
                    label={<span className="sr-only">{`Option ${i + 1}`}</span>}
                    error={shown(`option.${i}`, errors.optionLabels[i])}
                  >
                    {(field) => (
                      <input
                        {...field}
                        placeholder={`Option ${i + 1}`}
                        value={opt.label}
                        onBlur={() => {
                          touch(`option.${i}`)()
                          touch('options')()
                        }}
                        onChange={(e) => {
                          const options = [...form.options]
                          options[i] = { ...options[i], label: e.target.value }
                          setForm({ ...form, options })
                        }}
                      />
                    )}
                  </FormField>
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
                    key={`option-${i}-${imageResets[`option-${i}`] ?? 0}`}
                    hint="Option image (optional)"
                    variant="photo"
                    currentUrl={opt.imageUrl}
                    onFileSelect={(file) => handleImageSelect(file, true, i)}
                    disabled={saving}
                  />
                  {uploadErrors[`option-${i}`] && <p role="alert" className="mt-1 text-sm text-v-danger">{uploadErrors[`option-${i}`]}</p>}
                </div>
              </div>
            ))}
            {shown('options', errors.options) && (
              <p role="alert" className="v-error-text">{errors.options}</p>
            )}
            <button
              type="button"
              className="text-sm text-v-text-muted"
onClick={() => setForm({ ...form, options: [...form.options, { label: '', imageUrl: '', imageAssetId: null }] })}
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
        {uploading > 0 && <p role="status" className="text-sm text-v-text-muted">Uploading image… you can save once it finishes.</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving || formInvalid || uploading > 0}
            className="v-btn-primary disabled:opacity-60"
          >
            {editingId ? 'Update' : 'Add question'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-v-text-subtle">
              Cancel
            </button>
          )}
          {blockedReason && <p className="v-caption" role="status">{blockedReason}</p>}
        </div>
      </form>
        )
      }
      recordsPanel={
        <div className="pb-8">
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
                locked={setupLocked}
              />
            ))}
            {!questions.length && (
              <li className="v-card-md text-sm text-v-text-muted">
                No questions yet. Add your first question above.
              </li>
            )}
          </ul>
        </SortableContext>
      </DndContext>
        </div>
      }
    />
    </div>
  )
}
