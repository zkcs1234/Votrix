import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pageantService } from '@/services/pageant.service'
import { pageantEventSchemaStep1 } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ParticipantInformationFormBuilder from '@/components/organizer/ParticipantInformationFormBuilder'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

export default function CompetitionEventFormPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const isNew = !eventId || eventId === 'new'
  const isFormStep = location.pathname.includes('/form')
  const navigate = useNavigate()

  // If accessing /form route, start at step 3, otherwise step 1
  const [step, setStep] = useState(isFormStep ? 3 : 1)
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState(null)
  const [infoFormSchema, setInfoFormSchema] = useState(null)
  const [infoFormLoading, setInfoFormLoading] = useState(false)

  const {
    register,
    handleSubmit: rhfHandleSubmit,
    formState: { errors },
    trigger,
    reset,
  } = useForm({
    resolver: zodResolver(pageantEventSchemaStep1),
    defaultValues: {
      title: '',
      description: '',
    },
  })

  useEffect(() => {
    if (isNew) return
    pageantService.getEvent(eventId)
      .then(({ data }) => {
        reset({
          title: data.event.title || '',
          description: data.event.description || '',
        })
        setBanner(data.event.banner)
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Failed to load event')
      })
      .finally(() => setLoading(false))
  }, [eventId, isNew, reset])

  // Load information form schema
  const loadInfoFormSchema = useCallback(async () => {
    if (isNew) return
    setInfoFormLoading(true)
    try {
      const { data } = await pageantService.getInformationForm(eventId)
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
    setSaving(true)
    setError(null)

    try {
      const data = getValues()
      const payload = {
        title: data.title,
        description: data.description,
      }
      let id = eventId
      if (isNew) {
        const { data: res } = await pageantService.createEvent(payload)
        id = res.event.id
      } else {
        await pageantService.updateEvent(eventId, payload)
      }
      if (bannerFile) {
        await pageantService.uploadBanner(id, bannerFile)
      }

      // Go to step 3 (Information Form)
      if (isNew) {
        navigate(`/organizer/competition/events/${id}/form`, { replace: true })
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
      }
      let id = eventId
      if (isNew) {
        const { data: res } = await pageantService.createEvent(payload)
        id = res.event.id
      } else {
        await pageantService.updateEvent(eventId, payload)
      }
      if (bannerFile) {
        await pageantService.uploadBanner(id, bannerFile)
      }

      // For new events, go to step 3 (Information Form)
      if (isNew) {
        navigate(`/organizer/competition/events/${id}/form`, { replace: true })
      } else {
        navigate(`/organizer/competition/events/${id}/contestants`)
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
      <h2 className="v-page-title mb-2">{isNew ? 'Create Competition Scoring Event' : 'Edit Competition Scoring Event'}</h2>
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
                service={pageantService}
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
                onClick={() => navigate(`/organizer/competition/events/${eventId}/contestants`)}
                disabled={saving}
              >
                Continue to Contestants
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleNextStep2(e) }}>
            <ImageUploadField
              label="Event banner"
              hint="Wide image for event headers."
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