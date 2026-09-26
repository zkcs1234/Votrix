import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { electionService } from '@/services/election.service'
import { electionEventSchemaStep1, isoToLocalInput, localInputToIso } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import CalendarCard from '@/components/ui/CalendarCard'
import Card from '@/components/ui/Card'
import EventStepper from '@/components/ui/EventStepper'
import StageFooter from '@/components/ui/StageFooter'
import useEventProgress from '@/hooks/useEventProgress'
import useFormSession from '@/hooks/useFormSession'
import useDraft from '@/hooks/useDraft'
import useSilentDraftAutosave from '@/hooks/useSilentDraftAutosave'
import { draftService } from '@/services/draft.service'
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import { isSetupLocked } from '@/utils/constants'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

const RESULTS_VISIBILITY_OPTIONS = [
  {
    value: 'real_time',
    label: 'Real-time results',
    hint: 'Results stream as votes are cast.',
  },
  {
    value: 'hidden',
    label: 'Hidden results',
    hint: 'Results are never shown to voters.',
  },
  {
    value: 'public',
    label: 'Public results',
    hint: 'Results become visible once voting closes.',
  },
]

function inferStepFromPath(pathname) {
  if (pathname.includes('/branding')) return 'branding'
  return 'details'
}

function normalizeDraftStep(step) {
  if (step === 'branding') return step
  return 'details'
}

export default function ElectionEventFormPage() {
const { eventId } = useParams()
  const location = useLocation()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

const [step, setStep] = useState(() => inferStepFromPath(location.pathname))
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [draftRestored, setDraftRestored] = useState(false)
  const [eventStatus, setEventStatus] = useState(null)
  // A brand-new event has no status yet (null); it is always editable. Only an
  // existing event whose setup is locked (scheduled/active/…) is read-only.
  const readOnly = !isNew && isSetupLocked(eventStatus)

  const { completedKeys, markComplete, reset: resetProgress } = useEventProgress(
    'election',
    eventId,
  )

  const {
    register,
    control,
    getValues,
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isDirty },
    trigger,
    setValue,
    watch,
    reset,
  } = useForm({
    resolver: zodResolver(electionEventSchemaStep1),
    defaultValues: {
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      resultsVisibility: 'public',
    },
  })

  const { saveDraft, saveDraftAsync, deleteDraft, draft, saveStatus, lastSavedAt } = useDraft('election')

  // Session lifecycle: guarantees only one active session, and gives us a
  // stable session identity keyed by mode + eventId. With silent drafts, it
  // only blocks when there is work the background save could not protect.
  const {
    sessionKey,
    confirmLeave,
  } = useFormSession({
    module: 'election',
    eventId,
    dirty: Boolean(bannerFile) || saveStatus === 'error',
  })

  const formValues = watch()
  const resultsVisibility = formValues.resultsVisibility ?? 'public'
  const startDateValue = formValues.startDate ?? ''

  const buildDraftSnapshot = useCallback((data = getValues(), draftStep = step, currentBanner = banner) => ({
    step: draftStep,
    title: data.title,
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    resultsVisibility: data.resultsVisibility,
    banner: currentBanner,
    payload: {
      ...data,
      startDate: data.startDate,
      endDate: data.endDate,
      resultsVisibility: data.resultsVisibility,
    },
  }), [banner, getValues, step])

  const markDraftTouched = useCallback(() => {
    setDraftRestored(true)
  }, [])

useEffect(() => {
    setStep(inferStepFromPath(location.pathname))
  }, [location.pathname])

// Session-boundary cleanup: whenever the session identity changes (mode
  // switch or eventId change), reset all transient form state before the new
  // session initializes. This guarantees no stale values/errors/step/uploads
  // leak from the previous session.
  useEffect(() => {
    setBanner(null)
    setBannerFile(null)
    setError(null)
    setDraftRestored(false)
    reset({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      resultsVisibility: 'public',
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
      resultsVisibility: payload.resultsVisibility ?? 'public',
    })
    setBanner(draft.banner ?? null)
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
    enabled: isNew && !bannerFile,
    data: buildDraftSnapshot(formValues),
    saveDraftAsync,
    onAutosave: markDraftTouched,
  })

  useEffect(() => {
    if (isNew) return
    electionService
      .getEvent(eventId)
      .then(({ data }) => {
        const ev = data.event
        setEventStatus(ev.status ?? null)
        reset({
          title: ev.title || '',
          description: ev.description || '',
          startDate: isoToLocalInput(ev.startDate),
          endDate: isoToLocalInput(ev.endDate),
        })
setBanner(ev.banner)
        if (ev.banner) markComplete('branding')
        markComplete('details')
        setValue('resultsVisibility', ev.resultsVisibility ?? ev.results_visibility ?? 'public')
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load event')
      })
      .finally(() => setLoading(false))
  }, [eventId, isNew, reset, setValue, markComplete])

  const handleNext = async (e) => {
    e.preventDefault()
    const isValid = await trigger(['title', 'startDate', 'endDate'])
    if (!isValid) return

    if (isNew) {
      const data = getValues()
      setDraftRestored(true)
      saveDraftAsync(buildDraftSnapshot(data, 'branding'))
      setStep('branding')
    } else {
      setSaving(true)
      try {
        const data = getValues()
        const payload = {
          title: data.title,
          description: data.description,
          startDate: localInputToIso(data.startDate),
          endDate: localInputToIso(data.endDate),
          resultsVisibility: data.resultsVisibility,
        }
        await electionService.updateEvent(eventId, payload)
        setStep('branding')
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to update event')
      } finally {
        setSaving(false)
      }
    }
  }

  const handleNextBranding = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (isNew) {
        let currentBanner = banner
        if (bannerFile) {
          const res = await draftService.uploadBanner('election', bannerFile)
          currentBanner = res.data.url
          setBanner(currentBanner)
          setBannerFile(null)
        }
        const data = getValues()
        setDraftRestored(true)
        // Persist the draft, then create the real event and continue to setup.
        await saveDraft(buildDraftSnapshot(data, 'branding', currentBanner))
        await handleContinueToPositions()
      } else {
        if (bannerFile) {
          await electionService.uploadBanner(eventId, bannerFile)
          setBannerFile(null)
        }
        navigate(`/organizer/election/events/${eventId}/positions`)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  // Create the real event from the draft and continue into the setup steps
  // (Positions → Candidates → Voters). This is NOT the publish step anymore:
  // the event is created in the `draft` (setup) state and stays out of the
  // schedule until the organizer clicks "Finish & Publish" on the Voters page.
  const handleContinueToPositions = async () => {
    setSaving(true)
    setError(null)
    try {
      const data = getValues()
      const payload = {
        title: data.title,
        description: data.description,
        startDate: localInputToIso(data.startDate),
        endDate: localInputToIso(data.endDate),
        resultsVisibility: data.resultsVisibility,
      }
      // Draft banner and image_asset_id will be injected by backend
      const { data: res } = await draftService.publishDraft('election', payload)
      navigate(`/organizer/election/events/${res.event.id}/positions`, { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

const handleSubmitDetails = rhfHandleSubmit(async () => {
    setStep('branding')
  })

  // Save the current Create session as a draft, then continue navigation.
  const handleSaveAsDraft = async () => {
    if (isNew) {
      try {
        let currentBanner = banner
        if (bannerFile) {
          const res = await draftService.uploadBanner('election', bannerFile)
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

  const stepperEventId = isNew ? 'new' : eventId

  return (
    <div className="space-y-6">
      <>
          <EventStepper
            module="election"
            currentKey={step}
            eventId={stepperEventId}
            completedKeys={completedKeys}
          />

          {readOnly && <ReadOnlyEventBanner status={eventStatus} noun="election" />}

          <div className="w-full">
            <header>
              <h2 className="v-page-title mb-2">{isNew ? 'Create election event' : readOnly ? 'View election event' : 'Edit election event'}</h2>
              <p className="v-helper-text">
                Fill out the event basics, branding, and optional information form. Use the stepper or sidebar
                to jump between sections.
              </p>
            </header>
          </div>

          <div className="w-full">
            <Card padding="md">
            <fieldset disabled={readOnly} className="min-w-0 border-0 p-0 m-0">
            {step === 'details' && (
          <form className="space-y-4" onSubmit={handleSubmitDetails}>
            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Title <span className="text-v-danger">*</span>
              </label>
              <input
                id="title"
                className={INPUT_CLASS}
                {...register('title')}
                placeholder="Enter election title"
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
                placeholder="Enter election description (optional)"
              />
              {errors.description && <p className="v-error-text">{errors.description.message}</p>}
              <p className={HELPER_TEXT}>Optional description for voters</p>
            </div>

            <div className="v-date-row">
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
                      required
                      defaultHour={0}
                      defaultMinute={0}
                      hasError={Boolean(errors.startDate)}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />
                {errors.startDate && <p className="v-error-text">{errors.startDate.message}</p>}
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
                      required
                      defaultHour={23}
                      defaultMinute={59}
                      hasError={Boolean(errors.endDate)}
                      min={startDateValue || undefined}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />
                {errors.endDate && <p className="v-error-text">{errors.endDate.message}</p>}
              </div>
            </div>

            <fieldset className="v-form-field">
              <legend className={LABEL_CLASS}>Election Settings — Results</legend>
              <div className="mt-2 space-y-2">
                {RESULTS_VISIBILITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition ${
                      resultsVisibility === opt.value
                        ? 'border-v-primary bg-v-surface-elevated'
                        : 'border-v-border hover:border-v-border-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      className="mt-1"
                      value={opt.value}
                      {...register('resultsVisibility')}
                    />
                    <span>
                      <span className="block text-sm font-medium text-v-text">{opt.label}</span>
                      <span className={HELPER_TEXT}>{opt.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </form>
        )}

        {step === 'branding' && (
          <form className="space-y-4" onSubmit={handleNextBranding}>
            <ImageUploadField
              label="Event banner"
              hint="Wide image for event headers (stored on Cloudinary)."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
              disabled={saving || readOnly}
            />

            {error && <p className="v-error-text">{error}</p>}
          </form>
        )}

        </fieldset>
      </Card>

        {!readOnly && step === 'details' && (
            <StageFooter
              module="election"
              currentKey="details"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNext}
              nextLabel="Next: Branding"
              backLabel={null}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
        
        {!readOnly && step === 'branding' && (
            <StageFooter
              module="election"
              currentKey="branding"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextBranding}
              nextLabel={isNew ? 'Create & continue' : 'Next: Positions'}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}

        {/* Read-only events keep a plain Back/Next footer so you can still page
            through the stages to view them — just without the save actions. */}
        {readOnly && (
          <StageFooter module="election" currentKey={step} eventId={eventId} />
        )}
          </div>
        </>

      {blocked && (
        <UnsavedChangesDialog
          variant="leave"
          title="Save this election as a draft?"
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
