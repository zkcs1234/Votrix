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
import useSilentDraftAutosave from '@/hooks/useSilentDraftAutosave'
import { draftService } from '@/services/draft.service'
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
  const startDateValue = formValues.startDate ?? ''

  const buildDraftSnapshot = useCallback((data = getValues(), draftStep = step, currentBanner = banner, schema = infoFormSchema) => ({
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
      infoFormSchema: schema,
    },
  }), [banner, getValues, infoFormSchema, step])

  const markDraftTouched = useCallback(() => {
    setDraftRestored(true)
  }, [])

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
    if (draft.banner) {
      markComplete('branding')
    }
    if (nextStep === 'information-form' || nextStep === 'branding') {
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
        }
        await pageantService.updateEvent(eventId, payload)
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
          const res = await draftService.uploadBanner('competition', bannerFile)
          currentBanner = res.data.url
          setBanner(currentBanner)
          setBannerFile(null)
        }
        const data = getValues()
        setDraftRestored(true)
        saveDraftAsync(buildDraftSnapshot(data, 'information-form', currentBanner))
        setStep('information-form')
      } else {
        if (bannerFile) {
          await pageantService.uploadBanner(eventId, bannerFile)
          setBannerFile(null)
        }
        setStep('information-form')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  const handleFinishDraft = async () => {
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
      const { data: res } = await draftService.publishDraft('competition', payload)
      navigate(`/organizer/competition/events/${res.event.id}/contestants`, { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish event')
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

  const stepperEventId = isNew ? 'new' : eventId

  return (
    <div className="space-y-6">
      <>
          <EventStepper
            module="competition"
            currentKey={step}
            eventId={stepperEventId}
            completedKeys={completedKeys}
          />

          <div className="w-full">
            <header>
              <h2 className="v-page-title mb-2">
                {isNew ? 'Create Competition Scoring Event' : 'Edit Competition Scoring Event'}
              </h2>
              <p className="v-helper-text">
                Fill out the event basics, branding, and optional information form. Use the stepper or sidebar
                to jump between sections.
              </p>
            </header>
          </div>

          <div className="w-full">
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

            <div className="v-date-row">
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
                isDraft={isNew}
                onSave={(schema) => {
                  setInfoFormSchema(schema)
                  if (isNew) {
                    const data = getValues()
                    setDraftRestored(true)
                    saveDraftAsync(buildDraftSnapshot(data, 'information-form', banner, schema))
                  }
                }}
              />
            )}
          </div>
        )}
      </Card>
      
        {step === 'details' && (
            <StageFooter
              module="competition"
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
        
        {step === 'branding' && (
            <StageFooter
              module="competition"
              currentKey="branding"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextBranding}
              nextLabel={isNew ? 'Save & continue' : 'Next: Information Form'}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
        
        {step === 'information-form' && (
            <StageFooter
              module="competition"
              currentKey="information-form"
              eventId={stepperEventId}
              saving={saving}
              onNext={isNew ? handleFinishDraft : undefined}
              nextLabel={isNew ? 'Finish & Publish' : 'Continue to Contestants'}
              nextPath={isNew ? undefined : `/organizer/competition/events/${eventId}/contestants`}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
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
