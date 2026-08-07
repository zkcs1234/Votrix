import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pageantService } from '@/services/pageant.service'
import { pageantEventSchemaStep1, isoToLocalInput, localInputToIso } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import CalendarCard from '@/components/ui/CalendarCard'
import Card from '@/components/ui/Card'
import EventStepper from '@/components/ui/EventStepper'
import StageFooter from '@/components/ui/StageFooter'
import ParticipantInformationFormBuilder from '@/components/organizer/ParticipantInformationFormBuilder'
import useEventProgress from '@/hooks/useEventProgress'
import useFormSession from '@/hooks/useFormSession'
import useDraft from '@/hooks/useDraft'
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

function inferStepFromPath(pathname) {
  if (pathname.includes('/branding')) return 'branding'
  if (pathname.includes('/form')) return 'information-form'
  return 'details'
}

function normalizeDraftStep(step) {
  if (step === 'branding' || step === 'information-form') return step
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
  const [infoFormSchema, setInfoFormSchema] = useState(null)
  const [infoFormLoading, setInfoFormLoading] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [showDraftPrompt, setShowDraftPrompt] = useState(false)

const { completedKeys, markComplete, reset: resetProgress } = useEventProgress(
    'competition',
    eventId,
  )

const {
    register,
    control,
    getValues,
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isDirty },
    trigger,
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

  // Session lifecycle: guarantees only one active session, and gives us a
  // stable session identity keyed by mode + eventId. Also blocks leaving a
  // dirty Create session so we can offer Save as Draft / Discard / Cancel.
  const {
    sessionKey,
    confirmLeave,
  } = useFormSession({
    module: 'competition',
    eventId,
    dirty: isDirty || Boolean(bannerFile),
  })

  const { saveDraft, deleteDraft, draft } = useDraft('competition')

useEffect(() => {
    setStep(inferStepFromPath(location.pathname))
  }, [location.pathname])

  // Session-boundary cleanup: reset all transient form state whenever the
  // session identity changes so no stale values/errors/step/uploads leak.
  useEffect(() => {
    setBanner(null)
    setBannerFile(null)
    setInfoFormSchema(null)
    setError(null)
    setDraftRestored(false)
    setShowDraftPrompt(false)
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

  useEffect(() => {
    if (!isNew || !draft || draftRestored || showDraftPrompt) return
    setShowDraftPrompt(true)
  }, [draft, draftRestored, isNew, showDraftPrompt])

  const restoreDraft = useCallback(() => {
    if (!draft) return

    const payload = draft.payload || {}
    const nextStep = normalizeDraftStep(draft.step)
    setDraftRestored(true)
    setShowDraftPrompt(false)
    setStep(nextStep)
    reset({
      title: payload.title ?? draft.title ?? '',
      description: payload.description ?? '',
      startDate: payload.startDate ?? '',
      endDate: payload.endDate ?? '',
    })
    setBanner(draft.banner ?? null)
    if (draft.banner) {
      markComplete('branding')
    }
    if (nextStep === 'information-form' || nextStep === 'branding') {
      markComplete('details')
    }
  }, [draft, reset, markComplete])

  useEffect(() => {
    if (isNew) return
    pageantService.getEvent(eventId)
      .then(({ data }) => {
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
        setError(err.response?.data?.message || 'Failed to load event')
      })
      .finally(() => setLoading(false))
  }, [eventId, isNew, reset, markComplete])

  const loadInfoFormSchema = useCallback(async () => {
    if (isNew) return
    setInfoFormLoading(true)
try {
      const { data } = await pageantService.getInformationForm(eventId)
      const schema = data.informationFormSchema || data.schema || { enabled: false, fields: [] }
      setInfoFormSchema(schema)
      if (schema.enabled && (schema.fields || []).length > 0) {
        markComplete('information-form')
      }
    } catch (err) {
      console.error('Failed to load information form:', err)
      setInfoFormSchema({ enabled: false, fields: [] })
    } finally {
      setInfoFormLoading(false)
    }
  }, [eventId, isNew, markComplete])

  useEffect(() => {
    loadInfoFormSchema()
  }, [loadInfoFormSchema])

  const handleNext = async (e) => {
    e.preventDefault()
    const isValid = await trigger(['title', 'startDate', 'endDate'])
    if (isValid) setStep('branding')
  }

  const handleNextBranding = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const data = getValues()
      const payload = {
        title: data.title,
        description: data.description,
        startDate: localInputToIso(data.startDate),
        endDate: localInputToIso(data.endDate),
      }
      let id = eventId
      if (isNew) {
        const { data: res } = await pageantService.createEvent(payload)
        id = res.event.id
        await deleteDraft()
      } else {
        await pageantService.updateEvent(eventId, payload)
      }
      if (bannerFile) {
        await pageantService.uploadBanner(id, bannerFile)
      }

      if (isNew) {
        navigate(`/organizer/competition/events/${id}/form`, { replace: true })
      } else {
        setStep('information-form')
      }
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
  const handleSaveAsDraft = () => {
    const data = getValues()
    saveDraft({
      step,
      title: data.title,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      banner,
      payload: {
        ...data,
        startDate: data.startDate,
        endDate: data.endDate,
        infoFormSchema,
      },
    })
    confirmLeave?.proceed?.()
  }

  // Discard the draft and continue navigation.
  const handleDiscard = () => {
    deleteDraft()
    confirmLeave?.proceed?.()
  }

  const startNewDraftSession = async () => {
    await deleteDraft()
    setDraftRestored(true)
    setShowDraftPrompt(false)
    setBanner(null)
    setBannerFile(null)
    setInfoFormSchema(null)
    reset({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
    })
    resetProgress()
  }

  // Cancel navigation: stay on the form.
  const handleCancelLeave = () => {
    confirmLeave?.reset?.()
  }

  const blocked = confirmLeave?.state === 'blocked'

  if (loading) return <p className="v-caption">Loading...</p>

  const stepperEventId = isNew ? 'new' : eventId

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="v-page-title mb-2">
          {isNew ? 'Create Competition Scoring Event' : 'Edit Competition Scoring Event'}
        </h2>
        <p className="v-helper-text">
          Fill out the event basics, branding, and optional information form. Use the stepper or sidebar
          to jump between sections.
        </p>
      </header>

      <EventStepper
        module="competition"
        currentKey={step}
        eventId={stepperEventId}
        completedKeys={completedKeys}
      />

      <Card padding="md">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="startDate">
                  Start Date <span className="text-v-danger">*</span>
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
                  End Date <span className="text-v-danger">*</span>
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
                      min={watch('startDate') || undefined}
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

            <StageFooter
              module="competition"
              currentKey="details"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNext}
              nextLabel="Next: Branding"
              backLabel={null}
            />
          </form>
        )}

        {step === 'branding' && (
          <form className="space-y-4" onSubmit={handleNextBranding}>
            <ImageUploadField
              label="Event banner"
              hint="Wide image for event headers."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
              disabled={saving}
            />

            {error && <p className="v-error-text">{error}</p>}

            <StageFooter
              module="competition"
              currentKey="branding"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextBranding}
              nextLabel={isNew ? 'Save & continue' : 'Next: Information Form'}
            />
          </form>
        )}

        {step === 'information-form' && (
          <div className="space-y-4">
            {infoFormLoading ? (
              <p className="v-caption">Loading information form...</p>
            ) : (
<ParticipantInformationFormBuilder
                initialSchema={infoFormSchema}
                service={pageantService}
                eventId={eventId}
                onSave={(schema) => {
                  setInfoFormSchema(schema)
                }}
              />
            )}

<StageFooter
              module="competition"
              currentKey="information-form"
              eventId={eventId}
              saving={saving}
              nextLabel="Continue to Contestants"
            />
          </div>
        )}
      </Card>

      {showDraftPrompt && (
        <UnsavedChangesDialog
          variant="resume"
          title="Resume your draft?"
          message="You already have a saved draft for this competition event. Resume it, delete it, or start a fresh event."
          onPrimary={restoreDraft}
          onSecondary={async () => {
            await deleteDraft()
            setShowDraftPrompt(false)
            setDraftRestored(true)
            setBanner(null)
            setBannerFile(null)
            setInfoFormSchema(null)
            reset({
              title: '',
              description: '',
              startDate: '',
              endDate: '',
            })
            resetProgress()
          }}
          onCancel={startNewDraftSession}
          primaryLabel="Resume Draft"
          secondaryLabel="Delete Draft"
          cancelLabel="Start New Event"
        />
      )}

      {blocked && (
        <UnsavedChangesDialog
          variant="leave"
          title="Save this competition as a draft?"
          message="You have unsaved changes. Save your progress as a draft to pick up where you left off, or discard it."
          onPrimary={handleSaveAsDraft}
          onSecondary={handleDiscard}
          onCancel={handleCancelLeave}
          primaryLabel="Save as Draft"
          secondaryLabel="Discard"
          cancelLabel="Cancel"
        />
      )}
    </div>
  )
}
