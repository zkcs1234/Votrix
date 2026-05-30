import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import ImageUploadField from '@/components/upload/ImageUploadField'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function PollingEventFormPage() {
  const { eventId } = useParams()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '',
    description: '',
    pollAnonymous: false,
    pollAllowMultipleSubmissions: false,
    pollExpiresAt: '',
  })
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isNew) return
    pollingService.getSettings(eventId).then(({ data }) => {
      const e = data.event
      setForm({
        title: e.title,
        description: e.description || '',
        pollAnonymous: e.pollAnonymous,
        pollAllowMultipleSubmissions: e.pollAllowMultipleSubmissions,
        pollExpiresAt: e.pollExpiresAt ? e.pollExpiresAt.slice(0, 16) : '',
      })
      setBanner(e.banner)
    })
  }, [eventId, isNew])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        pollExpiresAt: form.pollExpiresAt ? new Date(form.pollExpiresAt).toISOString() : null,
      }
      let id = eventId
      if (isNew) {
        const { data } = await pollingService.createEvent(payload)
        id = data.event.id
      } else {
        await pollingService.updateEvent(eventId, payload)
      }
      if (bannerFile) {
        await pollingService.uploadBanner(id, bannerFile)
      }
      navigate(`/organizer/polling/events/${id}/builder`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="text-xl font-semibold text-v-text">{isNew ? 'Create poll' : 'Poll settings'}</h2>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <input
          className={inputClass}
          placeholder="Poll title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <textarea
          className={inputClass}
          rows={3}
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <ImageUploadField
          label="Poll banner (optional)"
          variant="banner"
          currentUrl={banner}
          onFileSelect={setBannerFile}
          disabled={saving}
        />

        <label className="flex items-center gap-2 text-sm text-v-text-muted">
          <input
            type="checkbox"
            checked={form.pollAnonymous}
            onChange={(e) => setForm({ ...form, pollAnonymous: e.target.checked })}
          />
          Anonymous responses (hide respondent identity in analytics)
        </label>

        <label className="flex items-center gap-2 text-sm text-v-text-muted">
          <input
            type="checkbox"
            checked={form.pollAllowMultipleSubmissions}
            onChange={(e) =>
              setForm({ ...form, pollAllowMultipleSubmissions: e.target.checked })
            }
          />
          Allow multiple submissions per respondent
        </label>

        <div>
          <label className="mb-1 block text-sm text-v-text-subtle">Expiration date (optional)</label>
          <input
            type="datetime-local"
            className={inputClass}
            value={form.pollExpiresAt}
            onChange={(e) => setForm({ ...form, pollExpiresAt: e.target.value })}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-v-primary px-6 py-2.5 text-white hover:bg-v-primary-hover disabled:opacity-60"
        >
          {isNew ? 'Create & build questions' : 'Save settings'}
        </button>
      </form>
    </div>
  )
}
