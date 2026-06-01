import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import ImageUploadField from '@/components/upload/ImageUploadField'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

export default function PageantEventFormPage() {
  const { eventId } = useParams()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (isNew) return
    pageantService.getEvent(eventId).then(({ data }) => {
      setTitle(data.event.title)
      setDescription(data.event.description || '')
      setBanner(data.event.banner)
    }).finally(() => setLoading(false))
  }, [eventId, isNew])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      let id = eventId
      if (isNew) {
        const { data } = await pageantService.createEvent({ title, description })
        id = data.event.id
      } else {
        await pageantService.updateEvent(eventId, { title, description })
      }
      if (bannerFile) await pageantService.uploadBanner(id, bannerFile)
      navigate(`/organizer/pageant/events/${id}/contestants`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="v-caption">Loading...</p>

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="v-page-title mb-6">{isNew ? 'Create pageant event' : 'Edit pageant event'}</h2>

      <Card padding="md">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="v-form-field">
            <label className={LABEL_CLASS} htmlFor="title">
              Title
            </label>
            <input
              id="title"
              className={INPUT_CLASS}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter pageant title"
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
              placeholder="Enter pageant description (optional)"
            />
            <p className={HELPER_TEXT}>Optional description for judges and contestants</p>
          </div>

          <ImageUploadField
            label="Event banner"
            hint="Wide image for event headers."
            variant="banner"
            currentUrl={banner}
            onFileSelect={setBannerFile}
            disabled={saving}
          />

          <div className="v-form-actions">
            <Button
              type="submit"
              disabled={saving}
            >
              {saving ? 'Saving...' : isNew ? 'Create pageant' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}