import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import CohortInviteManager from '@/components/organizer/CohortInviteManager'
import { isParticipantsLocked } from '@/utils/constants'

// Phase 5: organizers no longer register or CSV-import voters. Voter accounts
// are created by the admin; here the organizer invites existing students by
// cohort (program or year & section) to vote in this election.
export default function ElectionVotersPage() {
  const { eventId } = useParams()
  const [eventStatus, setEventStatus] = useState(null)

  useEffect(() => {
    let alive = true
    electionService
      .getEvent(eventId)
      .then(({ data }) => {
        if (alive) setEventStatus(data.event?.status ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [eventId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="v-page-title">Voters</h1>
        <p className="v-caption">
          Invite students to vote in this election by program or year &amp; section.
        </p>
      </div>

      <CohortInviteManager
        eventId={eventId}
        service={electionService}
        participantLabel="voters"
        rosterLocked={isParticipantsLocked(eventStatus)}
      />
    </div>
  )
}
