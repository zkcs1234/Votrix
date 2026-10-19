import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pageantService } from '@/services/pageant.service'
import { pageantEventSchemaStep1, isoToLocalInput, localInputToIso } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import CalendarCard from '@/components/ui/CalendarCard'
import Card from '@/components/ui/Card'
import { getNextStage, stagePath } from '@/utils/eventStages'
import SaveStatus from '@/components/ui/SaveStatus'
import useEventProgress from '@/hooks/useEventProgress'
import useFormSession from '@/hooks/useFormSession'
import useDraft from '@/hooks/useDraft'
import useSilentDraftAutosave from '@/hooks/useSilentDraftAutosave'
import { draftService } from '@/services/draft.service'
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import { isSetupLocked } from '@/utils/constants'
import Button from '@/components/ui/Button'

import { COMPETITION_TYPES } from '../../../../../shared/competition-creation-flow.js'
import EventStepper from '@/components/ui/EventStepper'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

function inferStepFromPath(pathname) {
  if (pathname.includes('/type')) return 'type'
  if (pathname.includes('/branding')) return 'branding'
  return 'details'
}

function normalizeDraftStep(step) {
  if (['branding', 'type'].includes(step)) return step
  return 'details'
}

export default function CompetitionEventFormPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

  const [step, setStep] = useState(() => inferStepFromPath(location.pathname))
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState(null)
  const [draftRestored, setDraftRestored] = useState(false)
  // Competition type is an optional LABEL (create only) — it does not seed any
  // structure; the organizer configures Structure & Scoring themselves. Kept as
  // local state and threaded through the draft payload so it survives step
  // navigation and draft restore.
  const [competitionType, setCompetitionType] = useState(null)
  const [competitionTypeOther, setCompetitionTypeOther] = useState('')
  const [eventStatus, setEventStatus] = useState(null)
  const [officialRulesId, setOfficialRulesId] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const operationRef = useRef(false)
  const creationKeyRef = useRef(crypto.randomUUID())
  // A brand-new event has no status yet (null); it is always editable. Only an
  // existing event whose setup is locked (scheduled/active/…) is read-only.
  const readOnly = !isNew && (loading || loadFailed || isSetupLocked(eventStatus) || Boolean(officialRulesId))

const { markComplete, reset: resetProgress } = useEventProgress(
    'competition',
    eventId,
  )

const {
    register,
    control,
    getValues,
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
  } = useForm({
    resolver: zodResolver(pageantEventSchemaStep1),
    defaultValues: {
      title: '',
      description: '',
      startDate: '',
      endDate: '',
    },
  })

  const { saveDraft, saveDraftAsync, deleteDraft, draft, saveStatus, lastSavedAt } = useDraft('competition')

  // Session lifecycle: guarantees only one active session, and gives us a
  // stable session identity keyed by mode + eventId. With silent drafts, it
  // only blocks when there is work the background save could not protect.
  const {
    sessionKey,
    confirmLeave,
  } = useFormSession({
    module: 'competition',
    eventId,
    dirty: Boolean(bannerFile) || saveStatus === 'error',
  })

  const formValues = watch()


  const buildDraftSnapshot = useCallback((data = getValues(), draftStep = step, currentBanner = banner) => ({
    step: draftStep,
    title: data.title,
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    banner: currentBanner,
    payload: {
      ...data,
      startDate: data.startDate,
      endDate: data.endDate,
      competitionType,
      competitionTypeOther,
      idempotencyKey: creationKeyRef.current,
    },
  }), [banner, competitionType, competitionTypeOther, getValues, step])

  const markDraftTouched = useCallback(() => {
    setDraftRestored(true)
  }, [])

useEffect(() => {
    setStep(inferStepFromPath(location.pathname))
  }, [location.pathname])

  // Session-boundary cleanup: reset all transient form state whenever the
  // session identity changes so no stale values/errors/step/uploads leak.
  useEffect(() => {
    creationKeyRef.current = crypto.randomUUID()
    setBanner(null)
    setBannerFile(null)
    setError(null)
    setDraftRestored(false)
    setCompetitionType(null)
    setCompetitionTypeOther('')
    setOfficialRulesId(null)
    setEventStatus(null)
    setLoadFailed(false)
    reset({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
    })
    resetProgress()
    // sessionKey intentionally gates re-runs; resets run on every new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  const restoreDraft = useCallback(() => {
    if (!draft) return

    const payload = draft.payload || {}
    const nextStep = normalizeDraftStep(draft.step)
    setDraftRestored(true)
    setStep(nextStep)
    reset({
      title: payload.title ?? draft.title ?? '',
      description: payload.description ?? '',
      startDate: payload.startDate ?? '',
      endDate: payload.endDate ?? '',
    })
    setBanner(draft.banner ?? null)
    setCompetitionType(payload.competitionType ?? null)
    setCompetitionTypeOther(payload.competitionTypeOther ?? '')
    if (payload.idempotencyKey) creationKeyRef.current = payload.idempotencyKey
    if (draft.banner) {
      markComplete('branding')
    }
    if (nextStep === 'branding') {
      markComplete('details')
    }
  }, [draft, reset, markComplete])

  useEffect(() => {
    if (!isNew || !draft || draftRestored || isDirty) return
    restoreDraft()
  }, [draft, draftRestored, isDirty, isNew, restoreDraft])

  useSilentDraftAutosave({
    enabled: isNew && !bannerFile && !saving,
    data: buildDraftSnapshot(formValues),
    saveDraftAsync,
    onAutosave: markDraftTouched,
  })

  useEffect(() => {
    if (isNew) return
    let alive = true
    setLoading(true)
    pageantService.getEvent(eventId)
      .then(({ data }) => {
        if (!alive) return
        setEventStatus(data.event.status ?? null)
        setOfficialRulesId(data.event.competitionCreatedAt || data.event.officialRulesId || data.event.official_rules_id || null)
        setLoadFailed(false)
        setError(null)
        reset({
          title: data.event.title || '',
          description: data.event.description || '',
          startDate: isoToLocalInput(data.event.startDate),
          endDate: isoToLocalInput(data.event.endDate),
        })
        setBanner(data.event.banner)
        if (data.event.banner) markComplete('branding')
        markComplete('details')
      })
      .catch((err) => {
        if (!alive) return
        setError(err.response?.data?.message || 'Failed to load event')
        setLoadFailed(true)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [eventId, isNew, reset, markComplete, loadAttempt])

  const validateCompetitionType = () => {
    if (!competitionType) { setError('Choose a competition type.'); return false }
    if (competitionType === '__other__' && !competitionTypeOther.trim()) {
      setError('Enter a competition type.')
      return false
    }
    return true
  }

  const handleNext = rhfHandleSubmit(async (data) => {
    if (operationRef.current || readOnly) return
    operationRef.current = true
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        await saveDraft(buildDraftSnapshot(data, 'branding'))
        setDraftRestored(true)
      } else {
        const payload = {
          title: data.title,
          description: data.description,
          startDate: localInputToIso(data.startDate),
          endDate: localInputToIso(data.endDate),
        }
        await pageantService.updateEvent(eventId, payload)
      }
      markComplete('details')
      setStep('branding')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event details. Your entries are kept; retry when ready.')
    } finally {
      operationRef.current = false
      setSaving(false)
    }
  })

  const handleNextBranding = rhfHandleSubmit(async () => {
    if (operationRef.current || readOnly) return
    operationRef.current = true
    setSaving(true)
    setError(null)

    try {
      if (isNew) {
        let currentBanner = banner
        if (bannerFile) {
          const res = await draftService.uploadBanner('competition', bannerFile)
          currentBanner = res.data.url
          setBanner(currentBanner)
          setBannerFile(null)
        }
        const data = getValues()
        setDraftRestored(true)
        await saveDraft(buildDraftSnapshot(data, 'branding', currentBanner))
        markComplete('branding')
        setStep('type')
      } else {
        if (bannerFile) {
          await pageantService.uploadBanner(eventId, bannerFile)
          setBannerFile(null)
        }
        navigate(`/organizer/competition/events/${eventId}/type`)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      operationRef.current = false
      setSaving(false)
    }
  }, () => { setStep('details'); setError('Check the event details before creating this competition.') })

  // Create the real event from the draft and continue into the setup steps
  // The returned event remains draft until Review & Publish freezes its rules.
  const handleContinueToContestants = async () => {
    const data = getValues()
    const payload = {
      title: data.title,
      description: data.description,
      startDate: localInputToIso(data.startDate),
      endDate: localInputToIso(data.endDate),
      competitionType: getCompetitionTypeValue(),
      idempotencyKey: creationKeyRef.current,
    }
    const { data: res } = await draftService.publishDraft('competition', payload)
    await deleteDraft()
    navigate(`/organizer/competition/events/${res.event.id}/categories`, { replace: true })
  }

  const handleNextType = rhfHandleSubmit(async () => {
    if (operationRef.current || readOnly || !validateCompetitionType()) return
    operationRef.current = true; setSaving(true); setError(null)
    try {
      await saveDraft(buildDraftSnapshot(getValues(), 'type'))
      await handleContinueToContestants()
    } catch (err) { setError(err.response?.data?.message || 'Unable to save the event draft. Your progress is retained.') }
    finally { operationRef.current = false; setSaving(false) }
  })

  const getCompetitionTypeValue = () => {
    if (competitionType !== '__other__') return competitionType
    return competitionTypeOther.trim() || null
  }

  // Save the current Create session as a draft, then continue navigation.
  const handleSaveAsDraft = async () => {
    if (isNew) {
      try {
        let currentBanner = banner
        if (bannerFile) {
          const res = await draftService.uploadBanner('competition', bannerFile)
          currentBanner = res.data.url
          setBanner(currentBanner)
          setBannerFile(null)
        }
        await saveDraft(buildDraftSnapshot(getValues(), step, currentBanner))
        setDraftRestored(true)
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to save draft')
        return
      }
    }
    confirmLeave?.proceed?.()
  }

  // Discard the draft and continue navigation.
  const handleDiscard = () => {
    deleteDraft()
    confirmLeave?.proceed?.()
  }

  // Cancel navigation: stay on the form.
  const handleCancelLeave = () => {
    confirmLeave?.reset?.()
  }

  const blocked = confirmLeave?.state === 'blocked'

  if (loading) return <p className="v-caption">Loading...</p>
  if (loadFailed) return <div role="alert" className="v-card p-5 space-y-3"><p className="v-error-text">{error}</p><Button variant="secondary" onClick={() => setLoadAttempt(value => value + 1)}>Retry loading event</Button></div>

  return (
    <div data-module="competition-scoring" className="mx-auto max-w-5xl space-y-6">
      <>
          <div className="v-card-sm overflow-hidden p-3 sm:p-4">
            <EventStepper
              module="competition"
              currentKey={step}
              eventId={isNew ? 'new' : eventId}
              completedKeys={step === 'type' ? ['details', 'branding'] : step === 'branding' ? ['details'] : []}
              navigationDisabled={saving}
              onLocalStageSelect={setStep}
            />
          </div>

          {readOnly && <ReadOnlyEventBanner status={eventStatus} noun="competition" frozen={Boolean(officialRulesId)} />}

          <div className="v-card-md">
            <header>
              <h2 className="v-page-title mb-2">
                {isNew ? 'Create Competition Scoring Event' : readOnly ? 'View Competition Scoring Event' : 'Edit Competition Scoring Event'}
              </h2>
              <p className="v-helper-text">
                Complete the eight setup steps, then review and create your event. Each competition keeps its own scoring, entries, judges, and results.
              </p>
            </header>
          </div>

          <div className="w-full">
            {error && <p role="alert" className="v-error-text">{error}</p>}
            <Card padding="md">
            <fieldset disabled={readOnly} className="min-w-0 border-0 p-0 m-0">
            {step === 'details' && (
          <form className="space-y-4" onSubmit={handleNext}>


            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Title <span className="text-v-danger">*</span>
              </label>
              <input
                id="title"
                className={INPUT_CLASS}
                {...register('title')}
                placeholder="Enter competition title"
              />
              {errors.title && <p className="v-error-text">{errors.title.message}</p>}
            </div>

            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                className={INPUT_CLASS}
                rows={4}
                {...register('description')}
                placeholder="Enter competition description (optional)"
              />
              {errors.description && <p className="v-error-text">{errors.description.message}</p>}
              <p className={HELPER_TEXT}>Optional description for judges and contestants</p>
            </div>

            <div className="v-date-row grid gap-4 sm:grid-cols-2">
              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="startDate">
                  Start Date and Time <span className="text-v-danger">*</span>
                </label>
                <Controller
                  control={control}
                  name="startDate"
                  render={({ field }) => (
                    <CalendarCard
                      id="startDate"
                      hasError={Boolean(errors.startDate)}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      max={formValues.endDate || undefined}
                      required
                      disabled={saving || readOnly}
                      twoStep
                      confirmDate
                      ariaDescribedBy={errors.startDate ? 'startDate-error' : undefined}
                    />
                  )}
                />
                {errors.startDate && <p id="startDate-error" className="v-error-text">{errors.startDate.message}</p>}
              </div>

              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="endDate">
                  End Date and Time <span className="text-v-danger">*</span>
                </label>
                <Controller
                  control={control}
                  name="endDate"
                  render={({ field }) => (
                    <CalendarCard
                      id="endDate"
                      hasError={Boolean(errors.endDate)}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      min={formValues.startDate || undefined}
                      required
                      disabled={saving || readOnly}
                      twoStep
                      confirmDate
                      ariaDescribedBy={errors.endDate ? 'endDate-error' : undefined}
                    />
                  )}
                />
                {errors.endDate && <p id="endDate-error" className="v-error-text">{errors.endDate.message}</p>}
              </div>
            </div>
          </form>
        )}

        {step === 'type' && (
              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="competition-template">
                  Competition type <span className="text-v-text-subtle">*</span>
                </label>
                <select
                  id="competition-template"
                  className={INPUT_CLASS}
                  value={competitionType ?? ''}
                  onChange={(e) => {
                    setCompetitionType(e.target.value || null)
                    if (e.target.value !== '__other__') setCompetitionTypeOther('')
                    setError(null)
                  }}
                >
                  <option value="">Choose a competition type</option>
                  {COMPETITION_TYPES.filter(([key]) => key !== 'other').map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                  <option value="__other__">Others</option>
                </select>
                {competitionType === '__other__' && (
                  <input
                    id="competition-type-other"
                    className={`${INPUT_CLASS} mt-2`}
                    value={competitionTypeOther}
                    onChange={(e) => {
                      setCompetitionTypeOther(e.target.value.slice(0, 32))
                      setError(null)
                    }}
                    placeholder="Enter competition type"
                    maxLength={32}
                  />
                )}
                <p className={HELPER_TEXT}>
                  This determines the competition and category choices in Step 4. Each selected competition is configured independently.
                </p>
              </div>
            )}

        {step === 'branding' && (
          <form className="space-y-4" onSubmit={handleNextBranding}>
            <ImageUploadField
              label="Event banner"
              hint="Wide image for event headers."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
              disabled={saving || readOnly}
            />

          </form>
        )}

        </fieldset>
      </Card>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-v-border pt-4">
          <div className="flex items-center gap-3">
            {step !== 'details' && (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => { setError(null); setStep(step === 'type' ? 'branding' : 'details') }}>
                Back: {step === 'type' ? 'Branding' : 'Event Details'}
              </Button>
            )}
            {!readOnly && <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />}
          </div>
          {readOnly ? (
            <Button type="button" onClick={() => {
              if (step === 'details') setStep('branding')

              else {
                const next = getNextStage('competition', step)
                if (next) navigate(stagePath('competition', next.key, eventId))
              }
            }}>Next</Button>
          ) : (
            <Button type="button" disabled={saving} onClick={step === 'details' ? handleNext : step === 'branding' ? handleNextBranding : handleNextType}>
              {saving ? 'Saving...' : step === 'details' ? 'Next: Branding' : step === 'branding' ? 'Next: Competition Type' : 'Next: Competitions / Categories'}
            </Button>
          )}
        </div>
          </div>
        </>

      {blocked && (
        <UnsavedChangesDialog
          variant="leave"
          title="Save this competition as a draft?"
          message="You have unsaved changes. Save your progress as a draft to pick up where you left off, or discard it."
          onPrimary={handleSaveAsDraft}
          onSecondary={handleDiscard}
          onCancel={handleCancelLeave}
          primaryLabel="Save & leave"
          secondaryLabel="Leave without saving"
          cancelLabel="Cancel"
        />
      )}
    </div>
  )
}
