import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pollingService } from '@/services/polling.service'
import CohortInviteManager from '@/components/organizer/CohortInviteManager'
import { isParticipantsLocked } from '@/utils/constants'

// Phase 5: organizers no longer register or CSV-import respondents. Accounts are
// created by the admin; here the organizer invites existing students by cohort
// (program or year & section) to respond to this poll.
export default function PollingRespondentsPage() {
  const { eventId } = useParams()
  const [eventStatus, setEventStatus] = useState(null)

  useEffect(() => {
    let alive = true
    pollingService
      .getSettings(eventId)
      .then(({ data }) => {
        if (alive) setEventStatus(data.settings?.status ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [eventId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="v-page-title">Respondents</h1>
        <p className="v-caption">
          Invite students to respond to this poll by program or year &amp; section.
        </p>
      </div>

      <CohortInviteManager
        eventId={eventId}
        service={pollingService}
        participantLabel="respondents"
        rosterLocked={isParticipantsLocked(eventStatus)}
      />
    </div>
  )
}
