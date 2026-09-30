import { useEffect, useState } from 'react'
import axios from 'axios'
import { Link } from 'react-router-dom'
import FormAlert from '@/components/ui/FormAlert'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
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
function CheckList({ options, selected, onToggle, empty, label }) {
  const [query, setQuery] = useState('')
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))

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
          {filteredOptions.map((opt) => {
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
          {filteredOptions.length === 0 && <p className="v-caption p-1">No matching {label.toLowerCase()}.</p>}
        </div>
      </div>
    </div>
  )
}

// Full organizer registration/edit form (organizer plan Phase B). Admin sets
// the whole profile + voter scope, so the organizer skips onboarding.
export default function CreateOrganizerModal({ isOpen, onClose, onSuccess, organizer = null }) {
  const isEdit = Boolean(organizer)
  const [taxonomy, setTaxonomy] = useState({ programs: [], sections: [] })
  const [taxonomyError, setTaxonomyError] = useState(null)
  const [taxonomyLoading, setTaxonomyLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { success, error: toastError } = useToast()

  const [form, setForm] = useState({
    email: '',
    organizerName: '',
    position: '',
    organizationName: '',
    organizationType: '',
    scopeType: '',
    programs: [],
    sections: [],
  })

  useEffect(() => {
    if (!isOpen) return
    setTaxonomyLoading(true)
    adminService
      .getParticipantTaxonomy()
      .then(({ data }) => {
        setTaxonomy(data.taxonomy ?? { programs: [], sections: [] })
        setTaxonomyError(null)
      })
      .catch(() => setTaxonomyError('Could not load program and section options.'))
      .finally(() => setTaxonomyLoading(false))

    setError(null)
    setForm({
      email: organizer?.email ?? '',
      organizerName: organizer?.organizer_name ?? '',
      position: organizer?.position ?? '',
      organizationName: organizer?.organization_name ?? '',
      organizationType: organizer?.organization_type_display ?? '',
      scopeType: organizer ? organizer.scope?.scopeType ?? 'all' : '',
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

  const scopeNeedsPrograms = form.scopeType === 'scoped' && (!taxonomy.programs.length || !form.programs.length)

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

  return (
    <Modal open={isOpen} onClose={onClose} title={isEdit ? 'Edit organizer' : 'Add organizer'} size="md">
        <p className="v-caption mt-1">
          {isEdit
            ? 'Update the organizer profile and voter scope.'
            : 'The account is active immediately with an emailed temporary password. No onboarding needed — you set the full profile and scope here.'}
        </p>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="organizer-email" className="v-label">Email</label>
            <input id="organizer-email" type="email" value={form.email} onChange={set('email')} className={INPUT_CLASS} required disabled={isEdit} placeholder="organizer@example.com" />
            {isEdit && <p className="v-caption mt-1">Email can&apos;t be changed here.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="organizer-name" className="v-label">Organizer name</label>
              <input id="organizer-name" type="text" value={form.organizerName} onChange={set('organizerName')} className={INPUT_CLASS} required />
            </div>
            <div>
              <label htmlFor="organizer-position" className="v-label">Position</label>
              <input id="organizer-position" type="text" value={form.position} onChange={set('position')} className={INPUT_CLASS} required placeholder="e.g. SSG Adviser" />
            </div>
            <div>
              <label htmlFor="organizer-organization-name" className="v-label">Organization name</label>
              <input id="organizer-organization-name" type="text" value={form.organizationName} onChange={set('organizationName')} className={INPUT_CLASS} required />
            </div>
            <div>
              <label htmlFor="organizer-organization-type" className="v-label">Organization type</label>
              <input id="organizer-organization-type" type="text" value={form.organizationType} onChange={set('organizationType')} className={INPUT_CLASS} required placeholder="e.g. Student Organization" />
            </div>
          </div>

          <fieldset className="space-y-3 border-t border-v-border pt-4">
            <legend className="v-label">Voter access</legend>
            <p className="v-caption">Choose which voters this organizer can manage.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-sm text-v-text">
                <input type="radio" name="organizer-scope" value="all" checked={form.scopeType === 'all'} onChange={set('scopeType')} className="mt-1 accent-v-primary" required />
                <span><span className="block font-medium">All programs and sections</span><span className="v-caption">Broad access across the organization.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm text-v-text">
                <input type="radio" name="organizer-scope" value="scoped" checked={form.scopeType === 'scoped'} onChange={set('scopeType')} className="mt-1 accent-v-primary" required />
                <span><span className="block font-medium">Selected programs</span><span className="v-caption">Limit access to the programs you choose.</span></span>
              </label>
            </div>
            {form.scopeType === 'scoped' && (
              <>
                <div>
                  <p className="v-caption mb-1">Programs ({form.programs.length} selected)</p>
                  <CheckList
                    options={taxonomy.programs}
                    selected={form.programs}
                    onToggle={(v) => toggle('programs', v)}
                    empty="No programs defined — add them in System Settings."
                    label="Programs"
                  />
                </div>
                <div>
                  <p className="v-caption mb-1">Year &amp; Sections ({form.sections.length} selected) <span className="text-v-text-subtle">(optional; leave blank for all sections)</span></p>
                  <CheckList
                    options={taxonomy.sections}
                    selected={form.sections}
                    onToggle={(v) => toggle('sections', v)}
                    empty="No sections defined; all sections will remain included."
                    label="Year and sections"
                  />
                </div>
                {taxonomyLoading && <p className="v-caption">Loading access options…</p>}
                {scopeNeedsPrograms && (
                  <FormAlert variant="warning">
                    {taxonomyError || 'Select at least one program to save a scoped organizer.'}{' '}
                    <Link to="/admin/settings" onClick={onClose} className="font-medium text-v-primary hover:underline">Open System Settings</Link>
                  </FormAlert>
                )}
              </>
            )}
          </fieldset>

          {error && <FormAlert variant="error">{error}</FormAlert>}

          <div className="flex justify-end gap-2 border-t border-v-border pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={loading} disabled={scopeNeedsPrograms}>{isEdit ? 'Save changes' : 'Create account'}</Button>
          </div>
        </form>
      </Modal>
  )
}
