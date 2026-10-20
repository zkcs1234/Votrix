import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import CohortInviteManager from '@/components/organizer/CohortInviteManager'
import ElectionGroupEligibility from '@/components/organizer/ElectionGroupEligibility'
import ElectionPositionEligibilitySummary from '@/components/organizer/ElectionPositionEligibilitySummary'
import PageHeader from '@/components/ui/PageHeader'
import { isParticipantsLocked } from '@/utils/constants'
import { useAuth } from '@/hooks/useAuth'

// Phase 5: organizers no longer register or CSV-import voters. Voter accounts
// are created by the admin; here the organizer invites existing students by
// cohort (program or year & section) to vote in this election.
export default function ElectionVotersPage() {
  const { eventId } = useParams()
  const { user } = useAuth()
  const canManagePositionEligibility = user?.scope?.scopeType !== 'scoped'
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
    <div data-module="election" className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Election Voters"
        description="Invite eligible voters by program or year and section, then manage ballot eligibility."
      />

      <CohortInviteManager
        eventId={eventId}
        service={electionService}
        participantLabel="voters"
        rosterLocked={isParticipantsLocked(eventStatus)}
      />
      {canManagePositionEligibility && <ElectionPositionEligibilitySummary eventId={eventId} />}
      <ElectionGroupEligibility eventId={eventId} locked={isParticipantsLocked(eventStatus)} />
    </div>
  )
}
