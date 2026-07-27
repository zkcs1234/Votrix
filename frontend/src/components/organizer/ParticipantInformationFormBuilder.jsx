import { useState, useEffect } from 'react'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

const FIELD_TYPES = [
  { value: 'text', label: 'Text input' },
  { value: 'dropdown', label: 'Dropdown select' },
  { value: 'number', label: 'Number' },
]

const DEFAULT_FIELD = { id: null, label: '', type: 'text', required: true, options: [] }

let fieldIdCounter = 0
function generateFieldId() {
  return `field_${++fieldIdCounter}_${Date.now()}`
}

export default function ParticipantInformationFormBuilder({
  initialSchema,
  onSave,
  saving = false,
  service,
  eventId,
}) {
  const [enabled, setEnabled] = useState(false)
  const [fields, setFields] = useState([])
  const [dirty, setDirty] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (initialSchema) {
      setEnabled(Boolean(initialSchema.enabled))
      const loaded = (initialSchema.fields || []).map((f) => ({
        ...f,
        id: f.id || generateFieldId(),
      }))
      setFields(loaded)
      fieldIdCounter = loaded.length
    }
  }, [initialSchema])

  useEffect(() => {
    setDirty(true)
  }, [enabled, fields])

  function addField() {
    setFields((prev) => [...prev, { ...DEFAULT_FIELD, id: generateFieldId() }])
  }

  function removeField(fieldId) {
    setFields((prev) => prev.filter((f) => f.id !== fieldId))
  }

  function updateField(fieldId, updates) {
    setFields((prev) =>
      prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f))
    )
  }

  function addOption(fieldId) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f
        return { ...f, options: [...(f.options || []), ''] }
      })
    )
  }

  function updateOption(fieldId, index, value) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f
        const options = [...(f.options || [])]
        options[index] = value
        return { ...f, options }
      })
    )
  }

  function removeOption(fieldId, index) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== fieldId) return f
        return { ...f, options: (f.options || []).filter((_, i) => i !== index) }
      })
    )
  }

  async function handleSave() {
    setError(null)

    if (enabled) {
      if (fields.length === 0) {
        setError('Add at least one field or disable the form')
        return
      }

      for (const field of fields) {
        if (!field.label.trim()) {
          setError('Every field must have a label')
          return
        }
        if (field.type === 'dropdown') {
          const validOptions = (field.options || []).filter((o) => o.trim())
          if (validOptions.length < 1) {
            setError(`Dropdown "${field.label}" must have at least one option`)
            return
          }
        }
      }
    }

    const schema = {
      enabled,
      fields: enabled
        ? fields.map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            required: f.required,
            options: f.type === 'dropdown' ? (f.options || []).filter((o) => o.trim()) : undefined,
          }))
        : [],
    }

    try {
      await service.updateInformationForm(eventId, schema)
      setDirty(false)
      if (onSave) onSave(schema)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save form')
    }
  }

  return (
    <div className="space-y-6">
      <Card padding="md">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-v-text">Participant Information Form</h3>
            <p className="text-sm text-v-text-subtle mt-1">
              Collect additional information from participants when they access this event.
              Information is stored per-event, not on the user profile.
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <div className="h-6 w-11 rounded-full bg-v-border after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-v-primary peer-checked:after:translate-x-full" />
            <span className="ml-3 text-sm font-medium text-v-text">
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
        </div>
      </Card>

      {enabled && (
        <>
          <div className="space-y-3">
            {fields.map((field) => (
              <Card key={field.id} padding="md" className="relative">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="v-label mb-1">Field label</label>
                    <input
                      type="text"
                      className="v-input w-full"
                      placeholder="e.g. Program, Year Level..."
                      value={field.label}
                      onChange={(e) => updateField(field.id, { label: e.target.value })}
                    />
                  </div>
                  <div className="w-40">
                    <label className="v-label mb-1">Type</label>
                    <select
                      className="v-input w-full"
                      value={field.type}
                      onChange={(e) =>
                        updateField(field.id, {
                          type: e.target.value,
                          options:
                            e.target.value === 'dropdown'
                              ? field.options?.length
                                ? field.options
                                : ['']
                              : undefined,
                        })
                      }
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id={`required-${field.id}`}
                      className="h-4 w-4 rounded border-v-border text-v-primary focus:ring-v-primary"
                      checked={field.required}
                      onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    />
                    <label
                      htmlFor={`required-${field.id}`}
                      className="text-sm text-v-text-muted cursor-pointer"
                    >
                      Required
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="pt-5 text-v-danger hover:text-v-danger/80 transition"
                    title="Remove field"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {field.type === 'dropdown' && (
                  <div className="mt-3 pl-2 border-l-2 border-v-border">
                    <p className="text-xs font-medium text-v-text-muted mb-2 uppercase tracking-wide">Options</p>
                    <div className="space-y-2">
                      {(field.options || []).map((option, optIndex) => (
                        <div key={optIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            className="v-input flex-1 text-sm"
                            placeholder={`Option ${optIndex + 1}`}
                            value={option}
                            onChange={(e) => updateOption(field.id, optIndex, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(field.id, optIndex)}
                            className="text-v-text-muted hover:text-v-danger transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => addOption(field.id)}
                      className="mt-2 text-sm text-v-primary hover:text-v-primary/80 transition"
                    >
                      + Add option
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
          <button
            type="button"
            onClick={addField}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-v-border p-4 text-sm text-v-text-muted hover:border-v-primary hover:text-v-primary transition"
          >
            <Plus className="h-4 w-4" />
            Add field
          </button>
        </>
      )}

      {enabled && fields.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 text-sm text-v-text-muted hover:text-v-text transition"
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
          {showPreview && (
            <Card padding="md" className="mt-2 space-y-4">
              <p className="text-sm font-medium text-v-text">Form preview</p>
              {fields.map((field) => (
                <div key={field.id}>
                  <label className="v-label">
                    {field.label}
                    {field.required && <span className="text-v-danger ml-1">*</span>}
                  </label>
                  {field.type === 'text' && (
                    <input type="text" className="v-input w-full opacity-60" placeholder={`Enter ${field.label.toLowerCase()}`} disabled />
                  )}
                  {field.type === 'number' && (
                    <input type="number" className="v-input w-full opacity-60" placeholder="0" disabled />
                  )}
                  {field.type === 'dropdown' && (
                    <select className="v-input w-full opacity-60" disabled>
                      <option>Select {field.label.toLowerCase()}...</option>
                      {(field.options || []).filter((o) => o.trim()).map((opt, i) => (
                        <option key={i}>{opt}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {error && <p className="text-sm text-v-danger">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Saving...' : dirty ? 'Save form' : 'Saved'}
        </Button>
      </div>
    </div>
  )
}
