import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pollingService } from '@/services/polling.service'
import { pollingEventSchemaStep1 } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import DateTimeInput from '@/components/ui/DateTimeInput'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

export default function PollingEventFormPage() {
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
    resolver: zodResolver(pollingEventSchemaStep1),
    defaultValues: {
      title: '',
      description: '',
      pollAnonymous: false,
      pollAllowMultipleSubmissions: false,
      pollExpiresAt: '',
    },
  })

  useEffect(() => {
    if (isNew) return
    pollingService.getSettings(eventId).then(({ data }) => {
      const e = data.event
      reset({
        title: e.title || '',
        description: e.description || '',
        pollAnonymous: e.pollAnonymous || false,
        pollAllowMultipleSubmissions: e.pollAllowMultipleSubmissions || false,
        pollExpiresAt: e.pollExpiresAt ? e.pollExpiresAt.slice(0, 16) : '',
      })
      setBanner(e.banner)
    }).finally(() => setLoading(false))
  }, [eventId, isNew, reset])

  const handleNext = async (e) => {
    e.preventDefault()
    let isValid = false
    if (step === 1) {
      isValid = await trigger(['title'])
    }
    if (isValid) {
      setStep(step + 1)
    }
  }

  const onSubmit = async (data) => {
    setSaving(true)
    setError(null)

    try {
      const payload = {
        title: data.title,
        description: data.description,
        pollAnonymous: data.pollAnonymous || false,
        pollAllowMultipleSubmissions: data.pollAllowMultipleSubmissions || false,
        pollExpiresAt: data.pollExpiresAt ? new Date(data.pollExpiresAt).toISOString() : null,
      }
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
      navigate(`/organizer/polling/events/${id}/builder`)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="v-caption">Loading...</p>

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="v-page-title">{isNew ? 'Create poll' : 'Poll settings'}</h2>
      
      <div className="flex items-center gap-2 text-sm text-v-text-subtle">
        <span className={step === 1 ? 'text-v-primary font-medium' : ''}>Step 1: Details</span>
        <span>→</span>
        <span className={step === 2 ? 'text-v-primary font-medium' : ''}>Step 2: Branding</span>
        <span>→</span>
        <span className={step === 3 ? 'text-v-primary font-medium' : ''}>Step 3: Settings</span>
      </div>

      <Card padding="md">
        {step === 1 && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleNext(e) }}>
            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Poll title
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

            <div className="v-form-actions">
              <Button type="submit">Next step</Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleNext(e) }}>
            <ImageUploadField
              label="Poll banner (optional)"
              hint="Wide image for poll headers."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
            />

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button type="submit">Next step</Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form className="space-y-4" onSubmit={rhfHandleSubmit(onSubmit)}>
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

            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="pollExpiresAt">
                Expiration date (optional)
              </label>
              <DateTimeInput
                id="pollExpiresAt"
                {...register('pollExpiresAt')}
              />
              <p className={HELPER_TEXT}>Poll will close after this date</p>
            </div>

            {error && <p className="v-error-text">{error}</p>}

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
                type="submit"
                disabled={saving}
              >
                {saving ? 'Saving...' : isNew ? 'Create & build questions' : 'Save settings'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}