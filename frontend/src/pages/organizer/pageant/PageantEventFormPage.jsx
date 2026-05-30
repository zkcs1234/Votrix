import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import ImageUploadField from '@/components/upload/ImageUploadField'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function PageantEventFormPage() {
  const { eventId } = useParams()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) return
    pageantService.getEvent(eventId).then(({ data }) => {
      setTitle(data.event.title)
      setDescription(data.event.description || '')
      setBanner(data.event.banner)
    })
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

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="text-xl font-semibold text-v-text">{isNew ? 'Create pageant' : 'Edit pageant'}</h2>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <input className={inputClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea className={inputClass} rows={4} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <ImageUploadField
          label="Event banner"
          variant="banner"
          currentUrl={banner}
          onFileSelect={setBannerFile}
          disabled={saving}
        />
        <button type="submit" disabled={saving} className="rounded-lg bg-v-primary px-6 py-2.5 text-white hover:bg-v-primary-hover disabled:opacity-60">
          Save
        </button>
      </form>
    </div>
  )
}
