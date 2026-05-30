import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

function typeLabel(type) {
  const map = {
    single_choice: 'Multiple choice',
    checkbox: 'Checkbox',
    yes_no: 'Yes / No',
    text: 'Text',
    rating: 'Rating',
  }
  return map[type] ?? type
}

function ChoiceChart({ options, totalResponses }) {
  const max = Math.max(...options.map((o) => o.count), 1)

  return (
    <ul className="mt-4 space-y-3">
      {options.map((o) => (
        <li key={o.optionId}>
          <div className="flex justify-between text-sm">
            <span className="text-v-text-muted">{o.label}</span>
            <span className="text-v-text-muted">
              {o.count} ({o.percentage}%)
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-v-surface-elevated">
            <div
              className="h-full bg-v-primary transition-all"
              style={{ width: `${(o.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
      <p className="text-xs text-v-text-subtle pt-1">{totalResponses} responses</p>
    </ul>
  )
}

export default function PollingAnalyticsPage() {
  const { eventId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    const load = () => {
      pollingService
        .getAnalytics(eventId)
        .then(({ data: res }) => {
          if (alive) setData(res.analytics)
        })
        .finally(() => {
          if (alive) setLoading(false)
        })
    }

    load()
    const id = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [eventId])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-v-text">Poll analytics</h2>
        <Link
          to={`/organizer/reports/polling/${eventId}`}
          className="text-sm text-v-text-muted hover:text-v-text"
        >
          Full report â†’
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-v-border bg-v-surface p-5">
          <p className="text-xs text-v-text-subtle">Total submissions</p>
          <p className="mt-2 text-3xl font-bold text-white">{data?.totalSubmissions ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-v-border bg-v-surface p-5">
          <p className="text-xs text-v-text-subtle">Mode</p>
          <p className="mt-2 text-lg font-medium text-v-text-muted">
            {data?.pollAnonymous ? 'Anonymous' : 'Identified'}
          </p>
        </div>
      </div>

      {(data?.questions ?? []).map((q) => (
        <section
          key={q.questionId}
          className="v-card p-6"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-medium text-v-text">{q.question}</h3>
            <span className="text-xs text-v-text-subtle">
              {typeLabel(q.type)} Â· {q.responseCount} answers
            </span>
          </div>

          {q.type === 'choice' && q.options && (
            <ChoiceChart options={q.options} totalResponses={q.totalResponses} />
          )}

          {q.type === 'rating' && q.distribution && (
            <>
              <p className="mt-3 text-sm text-v-text-subtle">
                Average rating: <span className="text-v-text-muted">{q.average}</span> / 5
              </p>
              <ChoiceChart
                options={q.distribution.map((d) => ({
                  optionId: String(d.rating),
                  label: `${d.rating} star${d.rating !== 1 ? 's' : ''}`,
                  count: d.count,
                  percentage: d.percentage,
                }))}
                totalResponses={q.responseCount}
              />
            </>
          )}

          {q.type === 'text' && (
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm text-v-text-muted">
              {(q.responses ?? []).length === 0 && (
                <li className="text-v-text-subtle">No text responses yet.</li>
              )}
              {(q.responses ?? []).map((r, i) => (
                <li key={i} className="rounded-lg border border-v-border px-3 py-2">
                  {r.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {!data?.questions?.length && (
        <p className="text-sm text-v-text-subtle">No events available. Create your first event to begin.</p>
      )}
    </div>
  )
}
