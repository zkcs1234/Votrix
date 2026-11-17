import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'
import { useLiveForm } from '@/hooks/useLiveForm'
import { officerSchema } from '@/schemas/people.schemas'
import { organizerOfficersService } from '@/services/organizer-officers.service'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

const SEARCH_DEBOUNCE_MS = 300
const POSITION_MAX = 255

export function studentName(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ') || student?.email || 'Student'
}

// Only the position has its own input; student-level refusals (e.g. outside the
// organizer's scope) have no field to sit under and belong in the form alert.
const SERVER_FIELDS = { position: ['position'] }

// Pick a student and give them a position. The list only ever contains eligible
// students inside the organizer's access scope who are not already officers; the
// server re-validates everything on assign, so this is a convenience, not a gate.
export default function AddOfficerModal({ isOpen, onClose, onSuccess }) {
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const { success, warning } = useToast()

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
    schema: officerSchema,
    defaultValues: { studentId: '', position: '' },
    serverFieldMap: SERVER_FIELDS,
  })
  const selectedId = watch('studentId') || null
  const position = watch('position')

  useEffect(() => {
    if (!isOpen) return
    setSearch('')
    setCandidates([])
    reset({ studentId: '', position: '' })
    setFormError(null)
    setLoadError(null)
  }, [isOpen, reset, setFormError])

  useEffect(() => {
    if (!isOpen) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await organizerOfficersService.candidates({ search: search.trim() || undefined, limit: 20 })
        if (cancelled) return
        setCandidates(data.candidates ?? [])
        setLoadError(null)
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Could not load students'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, search])

  const selected = candidates.find((c) => c.id === selectedId) ?? null

  const submit = async (values) => {
    setFormError(null)
    try {
      const { data } = await organizerOfficersService.assign({ studentId: values.studentId, position: values.position })
      if (data?.email && !data.email.sent) {
        warning('Officer added, but the notification email was not sent. Let them know yourself.')
      } else {
        success('Officer added')
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      // A position-specific rejection lands on the field; the rest is the banner.
      handleServerError(err, 'Could not add the officer')
    }
  }

  const saving = isSubmitting

  return (
    <Modal open={isOpen} onClose={onClose} title="Add officer" size="lg" closeDisabled={saving}>
      <p className="v-caption mt-1">
        Officers can manage this organization&apos;s events. Only students inside your access scope are listed.
      </p>
      <form className="mt-5 space-y-4" onSubmit={handleSubmit(submit)} noValidate>
        <div>
          <label htmlFor="officer-search" className="v-label">Find a student</label>
          <input
            id="officer-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={INPUT_CLASS}
            placeholder="Name, email or school ID"
            autoComplete="off"
          />
        </div>

        {loadError && <FormAlert variant="error">{loadError}</FormAlert>}

        <div
          role="radiogroup"
          aria-label="Students"
          className="max-h-64 divide-y divide-v-border overflow-auto rounded-lg border border-v-border"
        >
          {loading && candidates.length === 0 && <p className="p-4 text-center v-caption">Searching…</p>}
          {!loading && candidates.length === 0 && !loadError && (
            <p className="p-4 text-center v-caption">
              {search.trim() ? 'No matching students.' : 'No students are available to assign.'}
            </p>
          )}
          {candidates.map((c) => {
            const on = c.id === selectedId
            return (
              <label
                key={c.id}
                className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm transition ${on ? 'bg-v-primary/10' : 'hover:bg-v-surface-elevated'}`}
              >
                <input
                  type="radio"
                  name="officer-candidate"
                  checked={on}
                  onChange={() => setValue('studentId', c.id, { shouldValidate: true, shouldDirty: true })}
                  className="mt-1 accent-v-primary"
                  aria-label={studentName(c)}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-v-text">{studentName(c)}</span>
                  <span className="v-caption block truncate">
                    {[c.schoolId, c.program].filter(Boolean).join(' · ')}
                    {c.email ? ` · ${c.email}` : ''}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        <FormField
          label="Position"
          required
          error={errors.position?.message}
          hint={!selected ? 'Select a student first.' : undefined}
          counter={{ value: position, max: POSITION_MAX }}
        >
          {(field) => (
            <input placeholder="e.g. President" disabled={!selected} {...field} {...register('position')} />
          )}
        </FormField>

        {formError && <FormAlert variant="error">{formError}</FormAlert>}

        <div className="flex items-center justify-end gap-3 border-t border-v-border pt-4">
          {selected && blockedReason && <p className="v-caption mr-auto" role="status">{blockedReason}</p>}
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!selected || !canSubmit}>Add officer</Button>
        </div>
      </form>
    </Modal>
  )
}
