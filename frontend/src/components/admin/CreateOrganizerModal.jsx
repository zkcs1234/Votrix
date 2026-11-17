import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import FormAlert from '@/components/ui/FormAlert'
import FormField from '@/components/ui/FormField'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { adminService } from '@/services/admin.service'
import { API_BASE_URL } from '@/utils/constants'
import { clearCsrfToken, setCsrfToken } from '@/utils/csrf'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { useLiveForm } from '@/hooks/useLiveForm'
import { buildOrganizerSchema, ORGANIZER_SERVER_FIELDS } from '@/schemas/people.schemas'
import { getEmailOutcomeMessage } from '@/utils/emailOutcome'

async function ensureCsrfToken() {
  clearCsrfToken()
  const { data } = await axios.get(`${API_BASE_URL}/auth/csrf`, {
    withCredentials: true,
    params: { t: Date.now() },
  })
  if (data.csrfToken) setCsrfToken(data.csrfToken)
}

// Multi-select checkbox list for scope programs.
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

const EMPTY_VALUES = {
  email: '',
  organizerName: '',
  position: '',
  organizationName: '',
  organizationType: '',
  scopeType: '',
  programs: [],
}

function valuesFor(organizer) {
  if (!organizer) return EMPTY_VALUES
  return {
    email: organizer.email ?? '',
    organizerName: organizer.organizer_name ?? '',
    position: organizer.position ?? '',
    organizationName: organizer.organization_name ?? '',
    organizationType: organizer.organization_type_display ?? '',
    scopeType: organizer.scope?.scopeType ?? 'all',
    programs: organizer.scope?.programs ?? [],
  }
}

// Full organizer registration/edit form (organizer plan Phase B). Admin sets
// the whole profile + voter scope, so the organizer skips onboarding.
export default function CreateOrganizerModal({ isOpen, onClose, onSuccess, organizer = null }) {
  const isEdit = Boolean(organizer)
  const [programs, setPrograms] = useState([])
  const [programsError, setProgramsError] = useState(null)
  const [programsLoading, setProgramsLoading] = useState(false)
  const { success, warning, error: toastError } = useToast()

  const schema = useMemo(() => buildOrganizerSchema({ isEdit, programs }), [isEdit, programs])
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    formError,
    setFormError,
    handleServerError,
    blockedReason,
    canSubmit,
  } = useLiveForm({
    schema,
    defaultValues: valuesFor(organizer),
    serverFieldMap: ORGANIZER_SERVER_FIELDS,
  })

  const scopeType = watch('scopeType')
  const selectedPrograms = watch('programs') ?? []

  useEffect(() => {
    if (!isOpen) return
    setProgramsLoading(true)
    adminService
      .getPrograms()
      .then(({ data }) => {
        setPrograms(data.programs ?? [])
        setProgramsError(null)
      })
      .catch(() => setProgramsError('Could not load program options.'))
      .finally(() => setProgramsLoading(false))

    setFormError(null)
    reset(valuesFor(organizer))
  }, [isOpen, organizer, reset, setFormError])

  const toggleProgram = (value) =>
    setValue(
      'programs',
      selectedPrograms.includes(value) ? selectedPrograms.filter((v) => v !== value) : [...selectedPrograms, value],
      { shouldValidate: true, shouldDirty: true, shouldTouch: true },
    )

  const scopeNeedsPrograms = scopeType === 'scoped' && (!programs.length || !selectedPrograms.length)

  const onSubmit = async (values) => {
    setFormError(null)
    try {
      const payload = {
        organizerName: values.organizerName,
        position: values.position,
        organizationName: values.organizationName,
        organizationType: values.organizationType,
        scopeType: values.scopeType,
        programs: values.scopeType === 'scoped' ? values.programs : [],
      }
      if (isEdit) {
        await adminService.updateOrganizer(organizer.id, payload)
        success('Organizer updated')
      } else {
        await ensureCsrfToken()
        const { data } = await adminService.createOrganizer({ ...payload, email: values.email, sendEmail: true })
        success('Organizer created')
        if (!data.email?.sent) warning(getEmailOutcomeMessage(data.email))
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      // Field-specific rejections land on their input; the rest becomes the banner.
      const message = handleServerError(err, 'Save failed')
      if (message) toastError(message)
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title={isEdit ? 'Edit organizer' : 'Add organizer'} size="md">
        <p className="v-caption mt-1">
          {isEdit
            ? 'Update the organizer profile and voter scope.'
            : 'The account is active immediately with an emailed temporary password. No onboarding needed — you set the full profile and scope here.'}
        </p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {isEdit ? (
            <FormField label="Email" hint="Email can't be changed here.">
              {(field) => <input type="email" {...field} value={organizer.email ?? ''} disabled readOnly />}
            </FormField>
          ) : (
            <FormField label="Email" required error={errors.email?.message}>
              {(field) => (
                <input type="email" placeholder="organizer@example.com" autoComplete="off" {...field} {...register('email')} />
              )}
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Organizer name" required error={errors.organizerName?.message}>
              {(field) => <input type="text" {...field} {...register('organizerName')} />}
            </FormField>
            <FormField label="Position" required error={errors.position?.message}>
              {(field) => <input type="text" placeholder="e.g. SSG Adviser" {...field} {...register('position')} />}
            </FormField>
            <FormField label="Organization name" required error={errors.organizationName?.message}>
              {(field) => <input type="text" {...field} {...register('organizationName')} />}
            </FormField>
            <FormField label="Organization type" required error={errors.organizationType?.message}>
              {(field) => (
                <input type="text" placeholder="e.g. Student Organization" {...field} {...register('organizationType')} />
              )}
            </FormField>
          </div>

          <fieldset className="space-y-3 border-t border-v-border pt-4">
            <legend className="v-label">Student access scope</legend>
            <p className="v-caption">Select which student programs this organizer can access.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-sm text-v-text">
                <input type="radio" value="all" className="mt-1 accent-v-primary" {...register('scopeType')} />
                <span><span className="block font-medium">All programs</span><span className="v-caption">Broad access across the organization.</span></span>
              </label>
              <label className="flex items-start gap-2 text-sm text-v-text">
                <input type="radio" value="scoped" className="mt-1 accent-v-primary" {...register('scopeType')} />
                <span><span className="block font-medium">Selected programs</span><span className="v-caption">Limit access to the programs you choose.</span></span>
              </label>
            </div>
            {errors.scopeType && <p role="alert" className="v-error-text">{errors.scopeType.message}</p>}
            {scopeType === 'scoped' && (
              <>
                <div>
                  <p className="v-caption mb-1">Programs ({selectedPrograms.length} selected)</p>
                  <CheckList
                    options={programs}
                    selected={selectedPrograms}
                    onToggle={toggleProgram}
                    empty="No programs are defined."
                    label="Programs"
                  />
                </div>
                {programsLoading && <p className="v-caption">Loading access options…</p>}
                {scopeNeedsPrograms && (
                  <FormAlert variant="warning">
                    {programsError || 'Select at least one program to save a scoped organizer.'}
                  </FormAlert>
                )}
              </>
            )}
          </fieldset>

          {formError && <FormAlert variant="error">{formError}</FormAlert>}

          <div className="flex items-center justify-end gap-3 border-t border-v-border pt-4">
            {blockedReason && !scopeNeedsPrograms && (
              <p className="v-caption mr-auto" role="status">{blockedReason}</p>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isSubmitting} disabled={scopeNeedsPrograms || !canSubmit}>{isEdit ? 'Save changes' : 'Create account'}</Button>
          </div>
        </form>
      </Modal>
  )
}
