import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import ImageUploadField from '@/components/upload/ImageUploadField'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

export default function ElectionEventFormPage() {
  const { eventId } = useParams()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isNew) return
    electionService
      .getEvent(eventId)
      .then(({ data }) => {
        setTitle(data.event.title)
        setDescription(data.event.description || '')
        setBanner(data.event.banner)
      })
      .finally(() => setLoading(false))
  }, [eventId, isNew])

  const handleNext = (e) => {
    e.preventDefault()
    setStep(2)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      let id = eventId
      if (isNew) {
        const { data } = await electionService.createEvent({ title, description })
        id = data.event.id
      } else {
        await electionService.updateEvent(eventId, { title, description })
      }

      if (bannerFile) {
        await electionService.uploadBanner(id, bannerFile)
      }

      navigate(`/organizer/election/events/${id}/positions`)
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
      </div>

      <Card padding="md">
        {step === 1 ? (
          <form className="space-y-4" onSubmit={handleNext}>
            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Title
              </label>
              <input
                id="title"
                className={INPUT_CLASS}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter election title"
                required
              />
            </div>

            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                className={INPUT_CLASS}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter election description (optional)"
              />
              <p className={HELPER_TEXT}>Optional description for voters</p>
            </div>

            <div className="v-form-actions">
              <Button type="submit">Next step</Button>
            </div>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
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
                {saving ? 'Saving...' : isNew ? 'Create event' : 'Save changes'}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}