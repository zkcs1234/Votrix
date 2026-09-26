import { useEffect, useState } from 'react'
import axios from 'axios'
import { X, UserPlus, Pencil } from 'lucide-react'
import FormAlert from '@/components/ui/FormAlert'
import Button from '@/components/ui/Button'
import { adminService } from '@/services/admin.service'
import { API_BASE_URL } from '@/utils/constants'
import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

async function ensureCsrfToken() {
  clearCsrfToken()
  const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, {
    withCredentials: true,
    params: { t: Date.now() },
  })
  if (data.csrfToken) setCsrfToken(data.csrfToken)
}

// Multi-select checkbox list for scope programs / sections.
function CheckList({ options, selected, onToggle, empty }) {
  if (!options.length) return <p className="v-caption">{empty}</p>
  return (
    <div className="max-h-32 overflow-auto rounded-lg border border-v-border p-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const on = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`rounded-md border px-2 py-1 text-xs transition ${
                on ? 'border-v-primary bg-v-primary/10 text-v-text' : 'border-v-border text-v-text-muted hover:bg-v-surface-elevated'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Full organizer registration/edit form (organizer plan Phase B). Admin sets
// the whole profile + voter scope, so the organizer skips onboarding.
export default function CreateOrganizerModal({ isOpen, onClose, onSuccess, organizer = null }) {
  const isEdit = Boolean(organizer)
  const [taxonomy, setTaxonomy] = useState({ programs: [], sections: [] })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { success, error: toastError } = useToast()

  const [form, setForm] = useState({
    email: '',
    organizerName: '',
    position: '',
    organizationName: '',
    organizationType: '',
    scopeType: 'all',
    programs: [],
    sections: [],
  })

  useEffect(() => {
    if (!isOpen) return
    adminService
      .getParticipantTaxonomy()
      .then(({ data }) => setTaxonomy(data.taxonomy ?? { programs: [], sections: [] }))
      .catch(() => {})

    setError(null)
    setForm({
      email: organizer?.email ?? '',
      organizerName: organizer?.organizer_name ?? '',
      position: organizer?.position ?? '',
      organizationName: organizer?.organization_name ?? '',
      organizationType: organizer?.organization_type_display ?? '',
      scopeType: organizer?.scope?.scopeType ?? 'all',
      programs: organizer?.scope?.programs ?? [],
      sections: organizer?.scope?.sections ?? [],
    })
  }, [isOpen, organizer])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = {
        organizerName: form.organizerName,
        position: form.position,
        organizationName: form.organizationName,
        organizationType: form.organizationType,
        scopeType: form.scopeType,
        programs: form.scopeType === 'scoped' ? form.programs : [],
        sections: form.scopeType === 'scoped' ? form.sections : [],
      }
      if (isEdit) {
        await adminService.updateOrganizer(organizer.id, payload)
        success('Organizer updated')
      } else {
        await ensureCsrfToken()
        await adminService.createOrganizer({ ...payload, email: form.email, sendEmail: true })
        success('Organizer created — credentials emailed')
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.length ? details.join('; ') : getErrorMessage(err, 'Save failed')
      setError(message)
      toastError(message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-auto rounded-xl border border-v-border bg-v-surface p-6 shadow-xl">
        <button onClick={onClose} className="absolute right-4 top-4 p-1 text-v-text-muted hover:text-v-text" aria-label="Close">
          <X className="h-5 w-5" strokeWidth={2} />
        </button>

        <div className="flex items-center gap-2">
          {isEdit ? <Pencil className="h-5 w-5 text-v-text-muted" strokeWidth={1.5} /> : <UserPlus className="h-5 w-5 text-v-text-muted" strokeWidth={1.5} />}
          <h2 className="v-page-title">{isEdit ? 'Edit organizer' : 'Add organizer'}</h2>
        </div>
        <p className="v-caption mt-1">
          {isEdit
            ? 'Update the organizer profile and voter scope.'
            : 'The account is active immediately with an emailed temporary password. No onboarding needed — you set the full profile and scope here.'}
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <label className="v-label">Email</label>
            <input type="email" value={form.email} onChange={set('email')} className={INPUT_CLASS} required disabled={isEdit} placeholder="organizer@example.com" />
            {isEdit && <p className="v-caption mt-1">Email can&apos;t be changed here.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="v-label">Organizer name</label>
              <input type="text" value={form.organizerName} onChange={set('organizerName')} className={INPUT_CLASS} required />
            </div>
            <div>
              <label className="v-label">Position</label>
              <input type="text" value={form.position} onChange={set('position')} className={INPUT_CLASS} required placeholder="e.g. SSG Adviser" />
            </div>
            <div>
              <label className="v-label">Organization name</label>
              <input type="text" value={form.organizationName} onChange={set('organizationName')} className={INPUT_CLASS} required />
            </div>
            <div>
              <label className="v-label">Organization type</label>
              <input type="text" value={form.organizationType} onChange={set('organizationType')} className={INPUT_CLASS} required placeholder="e.g. Student Organization" />
            </div>
          </div>

          <div className="rounded-2xl border border-v-border p-4 space-y-3">
            <div>
              <label className="v-label">Voter scope</label>
              <select value={form.scopeType} onChange={set('scopeType')} className={INPUT_CLASS}>
                <option value="all">All access — every program &amp; section</option>
                <option value="scoped">Scoped — only selected programs / sections</option>
              </select>
            </div>
            {form.scopeType === 'scoped' && (
              <>
                <div>
                  <p className="v-caption mb-1">Programs</p>
                  <CheckList
                    options={taxonomy.programs}
                    selected={form.programs}
                    onToggle={(v) => toggle('programs', v)}
                    empty="No programs defined — add them in System Settings."
                  />
                </div>
                <div>
                  <p className="v-caption mb-1">Year &amp; Sections <span className="text-v-text-subtle">(optional — blank = all sections)</span></p>
                  <CheckList
                    options={taxonomy.sections}
                    selected={form.sections}
                    onToggle={(v) => toggle('sections', v)}
                    empty="No sections defined."
                  />
                </div>
              </>
            )}
          </div>

          {error && <FormAlert variant="error">{error}</FormAlert>}

          <div className="flex justify-end gap-2 border-t border-v-border pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading}>{isEdit ? 'Save changes' : 'Create account'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
