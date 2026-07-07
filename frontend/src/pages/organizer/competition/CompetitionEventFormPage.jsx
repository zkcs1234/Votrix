import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pageantService } from '@/services/pageant.service'
import { pageantEventSchemaStep1 } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

export default function CompetitionEventFormPage() {
  const { eventId } = useParams()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState(null)

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
    pageantService.getEvent(eventId).then(({ data }) => {
      reset({
        title: data.event.title || '',
        description: data.event.description || '',
      })
      setBanner(data.event.banner)
    }).finally(() => setLoading(false))
  }, [eventId, isNew, reset])

  const handleNext = async (e) => {
    e.preventDefault()
    const isValid = await trigger(['title'])
    if (isValid) {
      setStep(2)
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
      navigate(`/organizer/competition/events/${id}/contestants`)
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
        ) : (
          <form className="space-y-4" onSubmit={rhfHandleSubmit(onSubmit)}>
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
                {saving ? 'Saving...' : isNew ? 'Create Competition Scoring Event' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}