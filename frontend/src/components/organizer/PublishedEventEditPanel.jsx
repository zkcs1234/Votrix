import { useEffect, useMemo, useState } from 'react'
import { Pencil, PauseCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import { FORM_LIMITS } from '../../../../shared/form-rules.js'
import { useToast } from '@/hooks/useToast'
import { EVENT_STATUS } from '@/utils/constants'
import { isoToLocalInput, localInputToIso } from '@/schemas/event.schemas'

const MIN_REASON = 5
const MAX_REASON = 500
const MAX_TITLE = FORM_LIMITS.eventTitle
const MAX_DESCRIPTION = FORM_LIMITS.description

const sameInstant = (a, b) => {
  if (!a && !b) return true
  if (!a || !b) return false
  return new Date(a).getTime() === new Date(b).getTime()
}

/**
 * Lets an organizer correct a mistake after an event is published.
 *
 * What is offered comes from the server's edit policy
 * (`GET /events/:id/edit-policy`), so the rules live in one place:
 *  - title / description (and dates) can be corrected with a written reason;
 *  - a live event's end date can only be extended;
 *  - an event that is live but has no votes / responses yet can be paused and
 *    sent back to draft for a full revision.
 *
 * `service` is the module service (election / polling / pageant) and must expose
 * getEditPolicy, updateEvent and unpublishEvent(eventId, reason).
 */
export default function PublishedEventEditPanel({ eventId, event, service, noun = 'event', onChanged }) {
  const { success, error: showError } = useToast()
  const [policy, setPolicy] = useState(null)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [pauseReason, setPauseReason] = useState('')
  const [pausing, setPausing] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', startDate: '', endDate: '', reason: '' })
  // Fields the user has left at least once; their messages show from then on, live.
  const [touched, setTouched] = useState({})

  const status = event?.status
  const published = status === EVENT_STATUS.SCHEDULED || status === EVENT_STATUS.ACTIVE

  useEffect(() => {
    if (!published) {
      setPolicy(null)
      return undefined
    }
    let cancelled = false
    // The edit panel is optional UI: a failed or unavailable policy just hides it.
    Promise.resolve()
      .then(() => service.getEditPolicy(eventId))
      .then(({ data }) => {
        if (!cancelled) setPolicy(data.policy ?? null)
      })
      .catch(() => {
        if (!cancelled) setPolicy(null)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, published, status, service])

  // Re-seed the form from the saved event whenever the panel opens or the event changes.
  useEffect(() => {
    setForm({
      title: event?.title ?? '',
      description: event?.description ?? '',
      startDate: isoToLocalInput(event?.startDate),
      endDate: isoToLocalInput(event?.endDate),
      reason: '',
    })
    setTouched({})
  }, [event?.title, event?.description, event?.startDate, event?.endDate, open])

  const fields = useMemo(() => new Set(policy?.liveEditableFields ?? []), [policy])

  const payload = useMemo(() => {
    const next = {}
    if (fields.has('title') && form.title.trim() !== (event?.title ?? '')) next.title = form.title.trim()
    if (fields.has('description') && form.description.trim() !== (event?.description ?? '')) {
      next.description = form.description.trim()
    }
    if (fields.has('startDate') && form.startDate && !sameInstant(localInputToIso(form.startDate), event?.startDate)) {
      next.startDate = localInputToIso(form.startDate)
    }
    if (fields.has('endDate') && form.endDate && !sameInstant(localInputToIso(form.endDate), event?.endDate)) {
      next.endDate = localInputToIso(form.endDate)
    }
    return next
  }, [fields, form, event])

  // Problems with the current values, keyed by field. A message is only shown
  // once the user has left that field (see `shown`), then it updates live.
  const errors = useMemo(() => {
    const e = {}
    const title = form.title.trim()
    if (fields.has('title')) {
      if (!title) e.title = 'Title is required'
      else if (title.length > MAX_TITLE) e.title = `Title must be ${MAX_TITLE} characters or fewer`
    }
    if (fields.has('description') && form.description.trim().length > MAX_DESCRIPTION) {
      e.description = `Description must be ${MAX_DESCRIPTION} characters or fewer`
    }
    if (fields.has('startDate') && !form.startDate) e.startDate = 'Start date is required'
    if (fields.has('endDate')) {
      const start = form.startDate || isoToLocalInput(event?.startDate)
      if (!form.endDate) e.endDate = 'End date is required'
      else if (start && new Date(form.endDate) < new Date(start)) e.endDate = 'End date must be on or after start date'
      else if (
        policy?.endDateExtendOnly &&
        event?.endDate &&
        new Date(localInputToIso(form.endDate)).getTime() < new Date(event.endDate).getTime()
      ) {
        e.endDate = 'While the event is live the end date can only be extended, not shortened.'
      }
    }
    const reason = form.reason.trim()
    if (reason.length < MIN_REASON) e.reason = `Explain the change in at least ${MIN_REASON} characters.`
    else if (reason.length > MAX_REASON) e.reason = `Reason must be ${MAX_REASON} characters or fewer`
    return e
  }, [fields, form, event, policy])

  if (!published || !policy || policy.isTerminal) return null

  const hasChanges = Object.keys(payload).length > 0
  const hasErrors = Object.keys(errors).length > 0
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const touch = (key) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))
  const shown = (key) => (touched[key] ? errors[key] : undefined)
  const pauseReasonShort = pauseReason.trim().length < MIN_REASON

  let blockedReason = null
  if (!hasChanges) blockedReason = 'Change at least one detail to save.'
  else if (errors.reason && !touched.reason && Object.keys(errors).length === 1) blockedReason = 'Add a reason for the change to save.'
  else if (hasErrors) blockedReason = 'Fix the highlighted fields to continue.'

  const handleSave = async (e) => {
    e.preventDefault()
    if (blockedReason) return
    setSaving(true)
    try {
      await service.updateEvent(eventId, { ...payload, changeReason: form.reason.trim() })
      success('Changes saved and recorded in the audit log.')
      setOpen(false)
      setTouched({})
      await onChanged?.()
    } catch (err) {
      showError(err.response?.data?.message || 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  const handlePause = async () => {
    if (pauseReason.trim().length < MIN_REASON) return
    setPausing(true)
    try {
      await service.unpublishEvent(eventId, pauseReason.trim())
      success(`The ${noun} is paused and back in draft. Edit it, then publish again.`)
      setPauseOpen(false)
      setPauseReason('')
      await onChanged?.()
    } catch (err) {
      showError(err.response?.data?.message || `Could not pause the ${noun}`)
      await onChanged?.()
    } finally {
      setPausing(false)
    }
  }

  return (
    <div className="v-card-sm space-y-4" data-testid="published-edit-panel">
      <div>
        <h3 className="v-label mb-1">Made a mistake?</h3>
        <p className="v-helper-text">
          You can correct the details of a published {noun}. Every change needs a reason and is
          recorded in the audit log.
          {policy.endDateExtendOnly && ' While it is live the end date can only be extended.'}
        </p>
      </div>

      {!open && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil className="h-4 w-4" strokeWidth={1.5} />
          Edit published details
        </Button>
      )}

      {open && (
        <form onSubmit={handleSave} className="space-y-3" noValidate>
          {fields.has('title') && (
            <FormField
              label="Title"
              required
              error={shown('title')}
              counter={{ value: form.title, max: MAX_TITLE }}
            >
              {(p) => <input {...p} value={form.title} onChange={set('title')} onBlur={touch('title')} />}
            </FormField>
          )}
          {fields.has('description') && (
            <FormField
              label="Description"
              error={shown('description')}
              counter={{ value: form.description, max: MAX_DESCRIPTION }}
            >
              {(p) => (
                <textarea
                  {...p}
                  rows={3}
                  value={form.description}
                  onChange={set('description')}
                  onBlur={touch('description')}
                />
              )}
            </FormField>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.has('startDate') && (
              <FormField label="Start" required error={shown('startDate')}>
                {(p) => (
                  <input
                    {...p}
                    type="datetime-local"
                    value={form.startDate}
                    onChange={set('startDate')}
                    onBlur={touch('startDate')}
                  />
                )}
              </FormField>
            )}
            {fields.has('endDate') && (
              <FormField
                label={`End${policy.endDateExtendOnly ? ' (extend only)' : ''}`}
                required
                error={shown('endDate')}
              >
                {(p) => (
                  <input
                    {...p}
                    type="datetime-local"
                    value={form.endDate}
                    min={policy.endDateExtendOnly ? isoToLocalInput(event?.endDate) : undefined}
                    onChange={set('endDate')}
                    onBlur={touch('endDate')}
                  />
                )}
              </FormField>
            )}
          </div>
          <FormField
            label="Reason for the change (required)"
            error={shown('reason')}
            hint={`At least ${MIN_REASON} characters. This is recorded in the audit log.`}
            counter={{ value: form.reason, max: MAX_REASON }}
          >
            {(p) => (
              <textarea
                {...p}
                rows={2}
                value={form.reason}
                placeholder="e.g. Corrected a spelling mistake reported by the adviser"
                onChange={set('reason')}
                onBlur={touch('reason')}
              />
            )}
          </FormField>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={saving} disabled={Boolean(blockedReason) || saving}>
              Save changes
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            {blockedReason && <p className="v-caption" role="status">{blockedReason}</p>}
          </div>
        </form>
      )}

      {status === EVENT_STATUS.ACTIVE && (
        <div className="border-t border-v-border pt-4">
          {policy.canPauseRevise ? (
            <>
              <p className="v-helper-text mb-3">
                Need to change more than the details above? Nobody has taken part yet, so you can
                pause the {noun} and send it back to draft for a full revision. It stays closed
                until you publish it again.
              </p>
              {!pauseOpen ? (
                <Button variant="secondary" onClick={() => setPauseOpen(true)}>
                  <PauseCircle className="h-4 w-4" strokeWidth={1.5} />
                  Pause &amp; revise
                </Button>
              ) : (
                <div className="space-y-3">
                  <FormField
                    label="Reason for pausing (required)"
                    error={touched.pause && pauseReasonShort ? `Explain the pause in at least ${MIN_REASON} characters.` : undefined}
                    hint={`At least ${MIN_REASON} characters.`}
                    counter={{ value: pauseReason, max: MAX_REASON }}
                  >
                    {(p) => (
                      <textarea
                        {...p}
                        rows={2}
                        value={pauseReason}
                        onChange={(e) => setPauseReason(e.target.value)}
                        onBlur={touch('pause')}
                      />
                    )}
                  </FormField>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="danger"
                      onClick={handlePause}
                      loading={pausing}
                      disabled={pausing || pauseReason.trim().length < MIN_REASON}
                    >
                      Pause and move to draft
                    </Button>
                    <Button variant="ghost" onClick={() => setPauseOpen(false)} disabled={pausing}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="v-helper-text">
              {policy.hasActivity
                ? `Participation has already started, so the ${noun} structure can no longer be changed. You can still correct the details above or extend the end date.`
                : `The ${noun} structure cannot be changed while it is live.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
