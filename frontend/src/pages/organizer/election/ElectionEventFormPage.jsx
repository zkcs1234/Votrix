import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { electionService } from '@/services/election.service'
import { electionEventSchemaStep1 } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import DateTimeInput from '@/components/ui/DateTimeInput'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
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

export default function ElectionEventFormPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const isNew = !eventId || eventId === 'new'
  const isFormStep = location.pathname.includes('/form')
  const navigate = useNavigate()

  // If accessing /form route, start at step 3, otherwise step 1
  const [step, setStep] = useState(isFormStep ? 3 : 1)
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [infoFormSchema, setInfoFormSchema] = useState(null)
  const [infoFormLoading, setInfoFormLoading] = useState(false)

  const {
    register,
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

  useEffect(() => {
    if (isNew) return
    electionService
      .getEvent(eventId)
      .then(({ data }) => {
        const ev = data.event
        reset({
          title: ev.title || '',
          description: ev.description || '',
          startDate: ev.startDate ? ev.startDate.slice(0, 16) : '',
          endDate: ev.endDate ? ev.endDate.slice(0, 16) : '',
        })
        setBanner(ev.banner)
        setValue('resultsVisibility', ev.resultsVisibility ?? ev.results_visibility ?? 'public')
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load event')
      })
      .finally(() => setLoading(false))
  }, [eventId, isNew, reset, setValue])

  // Load information form schema
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
    const isValid = await trigger(['title'])
    if (isValid) {
      setStep(2)
    }
  }

  const handleNextStep2 = async (e) => {
    e.preventDefault()
    // For new events: create event first then go to step 3
    // For existing events: update event then go to step 3
    setSaving(true)
    setError(null)

    try {
      const data = getValues()
      const payload = {
        title: data.title,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
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

      // Go to step 3 (Information Form)
      if (isNew) {
        navigate(`/organizer/election/events/${id}/form`, { replace: true })
      } else {
        setStep(3)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  const onSubmit = async (data) => {
    setSaving(true)
    setError(null)

    try {
      const payload = {
        title: data.title,
        description: data.description,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
        endDate: data.endDate ? new Date(data.endDate).toISOString() : null,
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

      // For new events, go to step 3 (Information Form)
      if (isNew) {
        navigate(`/organizer/election/events/${id}/form`, { replace: true })
      } else {
        navigate(`/organizer/election/events/${id}/positions`)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="v-caption">Loading...</p>

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="v-page-title mb-2">{isNew ? 'Create election event' : 'Edit election event'}</h2>
      <div className="mb-6 flex items-center gap-2 text-sm text-v-text-subtle">
        <span className={step === 1 ? 'text-v-primary font-medium' : ''}>Step 1: Details</span>
        <span>→</span>
        <span className={step === 2 ? 'text-v-primary font-medium' : ''}>Step 2: Branding</span>
        <span>→</span>
        <span className={step === 3 ? 'text-v-primary font-medium' : ''}>Step 3: Information Form</span>
      </div>

      <Card padding="md">
        {step === 1 ? (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleNext(e) }}>
            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Title
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
                  Start Date (Optional)
                </label>
                <DateTimeInput
                  id="startDate"
                  {...register('startDate')}
                />
                {errors.startDate && <p className="v-error-text">{errors.startDate.message}</p>}
              </div>

              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="endDate">
                  End Date (Optional)
                </label>
                <DateTimeInput
                  id="endDate"
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

            <div className="v-form-actions">
              <Button type="submit">Next step</Button>
            </div>
          </form>
        ) : step === 3 ? (
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

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(2)}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                onClick={() => navigate(`/organizer/election/events/${eventId}/positions`)}
                disabled={saving}
              >
                Continue to Positions
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleNextStep2(e) }}>
            <ImageUploadField
              label="Event banner"
              hint="Wide image for event headers (stored on Cloudinary)."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
              disabled={saving}
            />

            {error && <p className="v-error-text">{error}</p>}

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Next step'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}