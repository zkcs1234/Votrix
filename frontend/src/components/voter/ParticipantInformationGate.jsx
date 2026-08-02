import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ParticipantInformationForm from '@/components/voter/ParticipantInformationForm'
import { voterService } from '@/services/voter.service'

export default function ParticipantInformationGate({ eventId }) {
  const [participantInfo, setParticipantInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true

    setLoading(true)
    voterService
      .getMyEventRole(eventId)
      .then(({ data }) => {
        if (alive) setParticipantInfo(data)
      })
      .catch(() => {
        if (alive) setParticipantInfo(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [eventId])

  if (loading) {
    return (
      <div className="v-card-sm">
        <LoadingSpinner />
        <p className="v-caption mt-3">Loading participant information...</p>
      </div>
    )
  }

  const schema = participantInfo?.informationFormSchema
  const fields = schema?.fields ?? []

  if (!schema?.enabled || fields.length === 0) {
    return null
  }

  return (
    <ParticipantInformationForm
      eventId={eventId}
      initialMetadata={participantInfo?.metadata}
      fields={fields}
    />
  )
}