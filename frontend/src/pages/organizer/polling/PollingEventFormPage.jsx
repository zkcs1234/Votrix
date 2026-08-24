import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pollingService } from '@/services/polling.service'
import {
  pollingEventSchemaStep1,
  pollingEventSchemaStep3,
  isoToLocalInput,
  localInputToIso,
} from '@/schemas/event.schemas'
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

import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'

function inferStepFromPath(pathname) {
  if (pathname.includes('/branding')) return 'branding'
  if (pathname.includes('/settings')) return 'settings'
  if (pathname.includes('/form')) return 'information-form'
  return 'details'
}

function normalizeDraftStep(step) {
  if (step === 'branding' || step === 'settings' || step === 'information-form') return step
  return 'details'
}

export default function PollingEventFormPage() {
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
    'polling',
    eventId,
  )

  const {
    register,
    control,
    getValues,
    formState: { errors, isDirty },
    trigger,
    reset,
    watch,
  } = useForm({
    resolver: zodResolver(
      step === 'settings' ? pollingEventSchemaStep3 : pollingEventSchemaStep1,
    ),
    defaultValues: {
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      pollAnonymous: false,
      pollAllowMultipleSubmissions: false,
    },
  })

  const { saveDraft, saveDraftAsync, deleteDraft, draft, saveStatus, lastSavedAt } = useDraft('polling')

  // Session lifecycle: guarantees only one active session, and gives us a
  // stable session identity keyed by mode + eventId. With silent drafts, it
  // only blocks when there is work the background save could not protect.
  const {
    sessionKey,
    confirmLeave,
  } = useFormSession({
    module: 'polling',
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
    pollAnonymous: data.pollAnonymous,
    pollAllowMultipleSubmissions: data.pollAllowMultipleSubmissions,
    banner: currentBanner,
    payload: {
      ...data,
      startDate: data.startDate,
      endDate: data.endDate,
      pollAnonymous: data.pollAnonymous,
      pollAllowMultipleSubmissions: data.pollAllowMultipleSubmissions,
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
      pollAnonymous: false,
      pollAllowMultipleSubmissions: false,
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
      pollAnonymous: payload.pollAnonymous ?? false,
      pollAllowMultipleSubmissions: payload.pollAllowMultipleSubmissions ?? false,
    })
    setBanner(draft.banner ?? null)
    if (payload.infoFormSchema) {
      setInfoFormSchema(payload.infoFormSchema)
    }
    if (draft.banner) {
      markComplete('branding')
    }
    if (nextStep === 'information-form' || nextStep === 'settings' || nextStep === 'branding') {
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
    pollingService
      .getSettings(eventId)
      .then(({ data }) => {
        const e = data.settings || data.event
        reset({
          title: e.title || '',
          description: e.description || '',
          startDate: isoToLocalInput(e.startDate),
          endDate: isoToLocalInput(e.endDate),
          pollAnonymous: e.pollAnonymous || false,
          pollAllowMultipleSubmissions: e.pollAllowMultipleSubmissions || false,
        })
        setBanner(e.banner)
        if (e.banner) markComplete('branding')
        markComplete('details')
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load poll settings')
      })
      .finally(() => setLoading(false))
  }, [eventId, isNew, reset, markComplete])

  const loadInfoFormSchema = useCallback(async () => {
    if (isNew) return
    setInfoFormLoading(true)
try {
      const { data } = await pollingService.getInformationForm(eventId)
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

  const handleNextDetails = async (e) => {
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
        const payload = buildPayload(data)
        await pollingService.updateEvent(eventId, payload)
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
          const res = await draftService.uploadBanner('polling', bannerFile)
          currentBanner = res.data.url
          setBanner(currentBanner)
          setBannerFile(null)
        }
        const data = getValues()
        setDraftRestored(true)
        saveDraftAsync(buildDraftSnapshot(data, 'settings', currentBanner))
        setStep('settings')
      } else {
        if (bannerFile) {
          await pollingService.uploadBanner(eventId, bannerFile)
          setBannerFile(null)
        }
        navigate(stageHref('settings'))
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save banner')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = getValues()
      const isValid = await trigger([
        'pollAnonymous',
        'pollAllowMultipleSubmissions',
      ])
      if (!isValid) {
        setSaving(false)
        return
      }
      if (isNew) {
        setDraftRestored(true)
        saveDraftAsync(buildDraftSnapshot(data, 'information-form'))
        setStep('information-form')
      } else {
        const payload = buildPayload(data)
        await pollingService.updateEvent(eventId, payload)
        navigate(`/organizer/polling/events/${eventId}/form`)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save poll settings')
    } finally {
      setSaving(false)
    }
  }

  const handleFinishDraft = async () => {
    setSaving(true)
    setError(null)
    try {
      const data = getValues()
      const payload = buildPayload(data)
      const { data: res } = await draftService.publishDraft('polling', payload)
      navigate(`/organizer/polling/events/${res.event.id}/builder`, { replace: true })
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish event')
    } finally {
      setSaving(false)
    }
  }

  function buildPayload(data) {
    return {
      title: data.title,
      description: data.description,
      startDate: localInputToIso(data.startDate),
      endDate: localInputToIso(data.endDate),
      pollAnonymous: data.pollAnonymous || false,
      pollAllowMultipleSubmissions: data.pollAllowMultipleSubmissions || false,
    }
  }

  function stageHref(stageKey) {
    const base = '/organizer/polling/events'
    if (isNew) return `${base}/new`
    const pathByKey = {
      details: 'edit',
      branding: 'branding',
      settings: 'settings',
      'information-form': 'form',
    }
    return `${base}/${eventId}/${pathByKey[stageKey]}`
  }

  // Save the current Create session as a draft, then continue navigation.
  const handleSaveAsDraft = async () => {
    if (isNew) {
      try {
        let currentBanner = banner
        if (bannerFile) {
          const res = await draftService.uploadBanner('polling', bannerFile)
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
            module="polling"
            currentKey={step}
            eventId={stepperEventId}
            completedKeys={completedKeys}
          />

          <div className="w-full">
            <header>
              <h2 className="v-page-title mb-2">
                {isNew ? 'Create poll' : 'Poll settings'}
              </h2>
              <p className="v-helper-text">
                Fill out the poll basics, branding, and settings. Use the stepper or sidebar
                to jump between sections.
              </p>
            </header>
          </div>

          <div className="w-full">
            <Card padding="md">
            {step === 'details' && (
          <form className="space-y-4" onSubmit={handleNextDetails}>
            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Poll title <span className="text-v-danger">*</span>
              </label>
              <input
                id="title"
                className={INPUT_CLASS}
                placeholder="Enter poll title"
                {...register('title')}
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
                rows={3}
                placeholder="Enter poll description (optional)"
                {...register('description')}
              />
              {errors.description && <p className="v-error-text">{errors.description.message}</p>}
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
              label="Poll banner (optional)"
              hint="Wide image for poll headers."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
              disabled={saving}
            />

            {error && <p className="v-error-text">{error}</p>}
          </form>
        )}

        {step === 'settings' && (
          <form className="space-y-4" onSubmit={handleSaveSettings}>
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 text-sm text-v-text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-v-border-strong"
                  {...register('pollAnonymous')}
                />
                <span>Anonymous responses</span>
              </label>
              <p className="v-caption -mt-2 pl-7">Hide respondent identity in analytics</p>

              <label className="flex items-center gap-3 text-sm text-v-text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-v-border-strong"
                  {...register('pollAllowMultipleSubmissions')}
                />
                <span>Allow multiple submissions</span>
              </label>
              <p className="v-caption -mt-2 pl-7">Allow respondents to submit more than once</p>
            </div>

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
                service={pollingService}
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
              module="polling"
              currentKey="details"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextDetails}
              nextLabel="Next: Branding"
              backLabel={null}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
        
        {step === 'branding' && (
            <StageFooter
              module="polling"
              currentKey="branding"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextBranding}
              nextLabel={isNew ? 'Save & continue' : 'Next: Settings'}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
        
        {step === 'settings' && (
            <StageFooter
              module="polling"
              currentKey="settings"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleSaveSettings}
              nextLabel={isNew ? 'Save & continue' : 'Next: Information Form'}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
        
        {step === 'information-form' && (
            <StageFooter
              module="polling"
              currentKey="information-form"
              eventId={stepperEventId}
              saving={saving}
              onNext={isNew ? handleFinishDraft : undefined}
              nextLabel={isNew ? 'Finish & Publish' : 'Continue to Builder'}
              nextPath={isNew ? undefined : `/organizer/polling/events/${eventId}/builder`}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
          </div>
        </>

      {blocked && (
        <UnsavedChangesDialog
          variant="leave"
          title="Save this poll as a draft?"
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
