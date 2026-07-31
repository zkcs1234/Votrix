import { useState, useEffect } from 'react'
import { Save, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { voterService } from '@/services/voter.service'

/**
 * Participant Information Form Component
 *
 * A dynamic form that collects participant-specific information
 * stored in the event_participants.metadata JSONB field.
 *
 * @param {string} eventId - The event ID
 * @param {object} initialMetadata - Existing metadata (from API)
 * @param {Array} fields - Array of field definitions
 *   [{ key: 'program', label: 'Program', type: 'text', required: true, options: [] }]
 * @param {function} onSuccess - Callback on successful save
 */
export default function ParticipantInformationForm({
  eventId,
  initialMetadata = {},
  fields = [],
  onSuccess
}) {
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Initialize form data from metadata
  useEffect(() => {
    if (initialMetadata && Object.keys(initialMetadata).length > 0) {
      setFormData(initialMetadata)
    }
  }, [initialMetadata])

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      await voterService.updateParticipantInformation(eventId, formData)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      onSuccess?.(formData)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save information')
    } finally {
      setSaving(false)
    }
  }

  // Don't render if no fields configured
  if (!fields || fields.length === 0) {
    return null
  }

  const isFilled = Object.keys(formData).some(key => {
    const field = fields.find(f => f.key === key)
    return field && formData[key]
  })

  return (
    <div className="rounded-xl border border-v-border bg-v-surface p-5">
      <div className="mb-4 flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-v-text-muted" />
        <h3 className="font-medium text-v-text">Your Information</h3>
      </div>

      <p className="mb-4 text-sm text-v-text-subtle">
        Please provide the following information for this event.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={field.key}
              className="mb-1.5 block text-sm font-medium text-v-text-muted"
            >
              {field.label}
              {field.required && <span className="text-v-danger ml-1">*</span>}
            </label>

            {field.type === 'select' ? (
              <select
                id={field.key}
                value={formData[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full rounded-lg border border-v-border bg-v-surface px-3 py-2 text-sm text-v-text focus:border-v-primary focus:outline-none focus:ring-1 focus:ring-v-primary"
                required={field.required}
              >
                <option value="">Select {field.label}</option>
                {field.options?.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                id={field.key}
                value={formData[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full rounded-lg border border-v-border bg-v-surface px-3 py-2 text-sm text-v-text focus:border-v-primary focus:outline-none focus:ring-1 focus:ring-v-primary"
                rows={3}
                required={field.required}
                placeholder={field.placeholder}
              />
            ) : field.type === 'checkbox' ? (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={field.key}
                  checked={Boolean(formData[field.key])}
                  onChange={(e) => handleChange(field.key, e.target.checked)}
                  className="h-4 w-4 rounded border-v-border text-v-primary focus:ring-v-primary"
                />
                <label htmlFor={field.key} className="text-sm text-v-text">
                  {field.checkboxLabel}
                </label>
              </div>
            ) : (
              <input
                type={field.type || 'text'}
                id={field.key}
                value={formData[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="w-full rounded-lg border border-v-border bg-v-surface px-3 py-2 text-sm text-v-text focus:border-v-primary focus:outline-none focus:ring-1 focus:ring-v-primary"
                required={field.required}
                placeholder={field.placeholder}
              />
            )}
          </div>
        ))}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-v-danger/10 p-3">
            <AlertCircle className="h-4 w-4 text-v-danger" />
            <p className="text-sm text-v-danger">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-v-success/10 p-3">
            <CheckCircle2 className="h-4 w-4 text-v-success" />
            <p className="text-sm text-v-success">Information saved successfully!</p>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !isFilled}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-v-primary px-4 py-2.5 font-medium text-white transition-colors hover:bg-v-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Information
            </>
          )}
        </button>
      </form>
    </div>
  )
}
