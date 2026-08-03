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

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

function inferStepFromPath(pathname) {
  if (pathname.includes('/settings')) return 'settings'
  if (pathname.includes('/form')) return 'information-form'
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

  const { completedKeys, markComplete } = useEventProgress('polling', eventId)

  const {
    register,
    control,
    getValues,
    formState: { errors },
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
      pollExpiresAt: '',
    },
  })

  useEffect(() => {
    setStep(inferStepFromPath(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    if (isNew) return
    pollingService
      .getSettings(eventId)
      .then(({ data }) => {
        const e = data.event
        reset({
          title: e.title || '',
          description: e.description || '',
          startDate: isoToLocalInput(e.startDate),
          endDate: isoToLocalInput(e.endDate),
          pollAnonymous: e.pollAnonymous || false,
          pollAllowMultipleSubmissions: e.pollAllowMultipleSubmissions || false,
          pollExpiresAt: isoToLocalInput(e.pollExpiresAt),
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
    if (isValid) {
      if (isNew) {
        setStep('branding')
      } else {
        navigate(stageHref('branding'))
      }
    }
  }

  const handleNextBranding = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = getValues()
      const payload = buildPayload(data)
      let id = eventId
      if (isNew) {
        const { data: res } = await pollingService.createEvent(payload)
        id = res.event.id
      } else {
        await pollingService.updateEvent(eventId, payload)
      }
      if (bannerFile) {
        await pollingService.uploadBanner(id, bannerFile)
      }
      if (isNew) {
        navigate(`/organizer/polling/events/${id}/settings`, { replace: true })
      } else {
        navigate(stageHref('settings'))
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save poll')
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
        'pollExpiresAt',
        'startDate',
        'endDate',
      ])
      if (!isValid) {
        setSaving(false)
        return
      }
      const payload = buildPayload(data)
      if (isNew) {
        const { data: res } = await pollingService.createEvent(payload)
        const id = res.event.id
        if (bannerFile) await pollingService.uploadBanner(id, bannerFile)
        navigate(`/organizer/polling/events/${id}/form`, { replace: true })
      } else {
        await pollingService.updateEvent(eventId, payload)
        navigate(`/organizer/polling/events/${eventId}/form`)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save poll settings')
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
      pollExpiresAt: localInputToIso(data.pollExpiresAt),
    }
  }

  function stageHref(stageKey) {
    const base = '/organizer/polling/events'
    if (isNew) return `${base}/new`
    const pathByKey = {
      details: 'edit',
      branding: 'edit',
      settings: 'settings',
      'information-form': 'form',
    }
    return `${base}/${eventId}/${pathByKey[stageKey]}`
  }

  if (loading) return <p className="v-caption">Loading...</p>

  const stepperEventId = isNew ? 'new' : eventId
  const startDateValue = watch('startDate', '')
  const endDateValue = watch('endDate', '')

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="v-page-title mb-2">
          {isNew ? 'Create poll' : 'Poll settings'}
        </h2>
        <p className="v-helper-text">
          Fill out the poll basics, branding, and settings. Use the stepper or sidebar
          to jump between sections.
        </p>
      </header>

<EventStepper
        module="polling"
        currentKey={step}
        eventId={stepperEventId}
        completedKeys={completedKeys}
      />

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

            <StageFooter
              module="polling"
              currentKey="details"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextDetails}
              nextLabel="Next: Branding"
              backLabel={null}
            />
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

            <StageFooter
              module="polling"
              currentKey="branding"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextBranding}
              nextLabel={isNew ? 'Save & continue' : 'Next: Settings'}
            />
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

            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="pollExpiresAt">
                Expiration date (optional)
              </label>
              <Controller
                control={control}
                name="pollExpiresAt"
                render={({ field }) => (
                  <CalendarCard
                    id="pollExpiresAt"
                    defaultHour={23}
                    defaultMinute={59}
                    hasError={Boolean(errors.pollExpiresAt)}
                    min={startDateValue || undefined}
                    max={endDateValue || undefined}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                  />
                )}
              />
              <p className={HELPER_TEXT}>
                Poll will close after this date. Must be within the start–end window.
              </p>
              {errors.pollExpiresAt && (
                <p className="v-error-text">{errors.pollExpiresAt.message}</p>
              )}
            </div>

            {error && <p className="v-error-text">{error}</p>}

            <StageFooter
              module="polling"
              currentKey="settings"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleSaveSettings}
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
                service={pollingService}
                eventId={eventId}
                onSave={(schema) => {
                  setInfoFormSchema(schema)
                }}
              />
            )}

            <StageFooter
              module="polling"
              currentKey="information-form"
              eventId={eventId}
              saving={saving}
              nextLabel="Continue to Builder"
              nextPath={`/organizer/polling/events/${eventId}/builder`}
            />
          </div>
        )}
      </Card>
    </div>
  )
}
