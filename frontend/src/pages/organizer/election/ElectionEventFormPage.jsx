import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import ImageUploadField from '@/components/upload/ImageUploadField'
import DateTimeInput from '@/components/ui/DateTimeInput'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'

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
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [resultsVisibility, setResultsVisibility] = useState('public')
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
        const ev = data.event
        setTitle(ev.title)
        setDescription(ev.description || '')
        // The mapper returns camelCase, but legacy snake_case keys may still
        // be present on cached responses — support both for safety.
        const start = ev.startDate ?? ev.start_date
        const end = ev.endDate ?? ev.end_date
        setStartDate(start ? start.slice(0, 16) : '')
        setEndDate(end ? end.slice(0, 16) : '')
        setBanner(ev.banner)
        setResultsVisibility(ev.resultsVisibility ?? ev.results_visibility ?? 'public')
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
      const payload = {
        title,
        description,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        endDate: endDate ? new Date(endDate).toISOString() : null,
        resultsVisibility,
      }
      let id = eventId
      if (isNew) {
        const { data } = await electionService.createEvent(payload)
        id = data.event.id
      } else {
        await electionService.updateEvent(eventId, payload)
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="startDate">
                  Start Date (Optional)
                </label>
                <DateTimeInput
                  id="startDate"
                  value={startDate}
                  onChange={setStartDate}
                />
              </div>

              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="endDate">
                  End Date (Optional)
                </label>
                <DateTimeInput
                  id="endDate"
                  value={endDate}
                  onChange={setEndDate}
                />
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
                      name="resultsVisibility"
                      className="mt-1"
                      value={opt.value}
                      checked={resultsVisibility === opt.value}
                      onChange={(e) => setResultsVisibility(e.target.value)}
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