import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { LogIn, Play } from 'lucide-react'
import { nativeCompetitionService } from '@/services/competition-native.service'

export default function CompetitionPublishedPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const [event, setEvent] = useState(() => location.state?.eventTitle ? {
    title: location.state.eventTitle,
  } : null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (event) return undefined
    let current = true
    nativeCompetitionService.parentReview(eventId)
      .then(({ data }) => {
        if (current) setEvent(data.event)
      })
      .catch((requestError) => {
        if (current) setError(requestError.response?.data?.message ?? requestError.message ?? 'Unable to load the published event.')
      })
    return () => { current = false }
  }, [eventId, event])

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center px-5 py-12 text-center" aria-labelledby="competition-published-title">
      <h1 id="competition-published-title" className="text-3xl font-extrabold uppercase tracking-tight text-v-text sm:text-4xl lg:text-5xl">
        {event?.title ?? 'Your competition is ready'}
      </h1>
      <p className="mt-8 max-w-4xl text-lg leading-relaxed text-v-text-muted sm:text-xl">
        All 8 setup steps are complete. You can now proceed to Live Control to manage the judging setup, review the live scoring session, and monitor the event.
      </p>
      <p className="mt-5 text-base text-v-text-subtle sm:text-lg">
        When you are ready, click the button below to continue.
      </p>

      <Link
        to={`/organizer/competition/events/${eventId}/live`}
        className="group mt-10 flex flex-col items-center rounded-2xl px-6 py-2 text-v-primary transition hover:bg-v-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v-primary focus-visible:ring-offset-4"
      >
        <Play className="h-36 w-36 stroke-[2.5] sm:h-48 sm:w-48" aria-hidden="true" />
        <span className="mt-5 text-3xl font-bold text-v-primary sm:text-4xl">
          Proceed to Live Control
        </span>
      </Link>

      {error && <p role="alert" className="mt-5 text-sm text-v-danger">{error}</p>}

      <Link
        to={`/organizer/competition/events/${eventId}/workspace`}
        className="mt-10 inline-flex min-h-14 items-center gap-3 rounded-full border-2 border-v-border px-8 py-3 text-lg font-medium text-v-text transition hover:border-v-primary hover:bg-v-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v-primary focus-visible:ring-offset-2"
      >
        <LogIn className="h-7 w-7" aria-hidden="true" />
        Exit to Events
      </Link>
    </main>
  )
}
