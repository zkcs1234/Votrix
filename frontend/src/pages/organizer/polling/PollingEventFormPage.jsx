import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
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
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState(null)

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
    }).finally(() => setLoading(false))
  }, [eventId, isNew])

  const handleNext = (e) => {
    e.preventDefault()
    setStep(step + 1)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    
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
          <form className="space-y-4" onSubmit={handleNext}>
            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Poll title
              </label>
              <input
                id="title"
                className={INPUT_CLASS}
                placeholder="Enter poll title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
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
                rows={3}
                placeholder="Enter poll description (optional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="v-form-actions">
              <Button type="submit">Next step</Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="space-y-4" onSubmit={handleNext}>
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
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-3 pt-2">
              <label className="flex items-center gap-3 text-sm text-v-text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-v-border-strong"
                  checked={form.pollAnonymous}
                  onChange={(e) => setForm({ ...form, pollAnonymous: e.target.checked })}
                />
                <span>Anonymous responses</span>
              </label>
              <p className="v-caption -mt-2 pl-7">Hide respondent identity in analytics</p>

              <label className="flex items-center gap-3 text-sm text-v-text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-v-border-strong"
                  checked={form.pollAllowMultipleSubmissions}
                  onChange={(e) =>
                    setForm({ ...form, pollAllowMultipleSubmissions: e.target.checked })
                  }
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
                value={form.pollExpiresAt}
                onChange={(val) => setForm({ ...form, pollExpiresAt: val })}
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