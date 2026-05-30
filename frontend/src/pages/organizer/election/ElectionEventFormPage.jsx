import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import ImageUploadField from '@/components/upload/ImageUploadField'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function ElectionEventFormPage() {
  const { eventId } = useParams()
  /** Route `events/new` has no :eventId param â€” useParams() is undefined there */
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

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

  if (loading) return <p className="text-v-text-subtle">Loadingâ€¦</p>

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="text-xl font-semibold text-v-text">{isNew ? 'Create event' : 'Edit event'}</h2>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Title</label>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Description</label>
          <textarea
            className={inputClass}
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <ImageUploadField
          label="Event banner"
          hint="Wide image for event headers (stored on Cloudinary)."
          variant="banner"
          currentUrl={banner}
          onFileSelect={setBannerFile}
          disabled={saving}
        />

        {error && <p className="text-sm text-v-danger">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-v-primary px-6 py-2.5 text-white hover:bg-v-primary-hover disabled:opacity-60"
        >
          {saving ? 'Savingâ€¦' : 'Save event'}
        </button>
      </form>
    </div>
  )
}
