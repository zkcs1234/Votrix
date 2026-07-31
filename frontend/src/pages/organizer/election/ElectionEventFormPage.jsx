import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { electionService } from '@/services/election.service'
import { electionEventSchemaStep1, isoToLocalInput, localInputToIso } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import CalendarCard from '@/components/ui/CalendarCard'
import Card from '@/components/ui/Card'
import EventStepper from '@/components/ui/EventStepper'
import StageFooter from '@/components/ui/StageFooter'
import ParticipantInformationFormBuilder from '@/components/organizer/ParticipantInformationFormBuilder'

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
  if (pathname.includes('/form')) return 'information-form'
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
  const [infoFormSchema, setInfoFormSchema] = useState(null)
  const [infoFormLoading, setInfoFormLoading] = useState(false)

  const {
    register,
    getValues,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
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

  const resultsVisibility = watch('resultsVisibility', 'public')
  const startDateValue = watch('startDate', '')

  useEffect(() => {
    setStep(inferStepFromPath(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    if (isNew) return
    electionService
      .getEvent(eventId)
      .then(({ data }) => {
        const ev = data.event
        reset({
          title: ev.title || '',
          description: ev.description || '',
          startDate: isoToLocalInput(ev.startDate),
          endDate: isoToLocalInput(ev.endDate),
        })
        setBanner(ev.banner)
        setValue('resultsVisibility', ev.resultsVisibility ?? ev.results_visibility ?? 'public')
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load event')
      })
      .finally(() => setLoading(false))
  }, [eventId, isNew, reset, setValue])

  const loadInfoFormSchema = useCallback(async () => {
    if (isNew) return
    setInfoFormLoading(true)
    try {
      const { data } = await electionService.getInformationForm(eventId)
      setInfoFormSchema(data.schema || { enabled: false, fields: [] })
    } catch (err) {
      console.error('Failed to load information form:', err)
      setInfoFormSchema({ enabled: false, fields: [] })
    } finally {
      setInfoFormLoading(false)
    }
  }, [eventId, isNew])

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
        resultsVisibility: data.resultsVisibility,
      }
      let id = eventId
      if (isNew) {
        const { data: res } = await electionService.createEvent(payload)
        id = res.event.id
      } else {
        await electionService.updateEvent(eventId, payload)
      }

      if (bannerFile) {
        await electionService.uploadBanner(id, bannerFile)
      }

      if (isNew) {
        navigate(`/organizer/election/events/${id}/form`, { replace: true })
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

  if (loading) return <p className="v-caption">Loading...</p>

  const stepperEventId = isNew ? 'new' : eventId

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="v-page-title mb-2">{isNew ? 'Create election event' : 'Edit election event'}</h2>
        <p className="v-helper-text">
          Fill out the event basics, branding, and optional information form. Use the stepper or sidebar
          to jump between sections.
        </p>
      </header>

      <EventStepper module="election" currentKey={step} eventId={stepperEventId} />

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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="startDate">
                  Start Date <span className="text-v-danger">*</span>
                </label>
                <CalendarCard
                  id="startDate"
                  required
                  hasError={Boolean(errors.startDate)}
                  {...register('startDate')}
                />
                {errors.startDate && <p className="v-error-text">{errors.startDate.message}</p>}
              </div>

              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="endDate">
                  End Date <span className="text-v-danger">*</span>
                </label>
                <CalendarCard
                  id="endDate"
                  required
                  hasError={Boolean(errors.endDate)}
                  min={startDateValue || undefined}
                  {...register('endDate')}
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

            <StageFooter
              module="election"
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
              hint="Wide image for event headers (stored on Cloudinary)."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
              disabled={saving}
            />

            {error && <p className="v-error-text">{error}</p>}

            <StageFooter
              module="election"
              currentKey="branding"
              eventId={stepperEventId}
              saving={saving}
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
                service={electionService}
                eventId={eventId}
                saving={saving}
                onSave={(schema) => {
                  setInfoFormSchema(schema)
                }}
              />
            )}

            <StageFooter
              module="election"
              currentKey="information-form"
              eventId={eventId}
              saving={saving}
              nextLabel="Continue to Positions"
            />
          </div>
        )}
      </Card>
    </div>
  )
}
