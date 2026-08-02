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
  const showDebugInfo = import.meta.env.DEV

  if (!schema?.enabled || fields.length === 0) {
    return showDebugInfo ? (
      <div className="space-y-3">
        <div className="v-card-sm border-v-border">
          <p className="text-sm font-medium text-v-text">Participant information debug</p>
          <div className="mt-2 space-y-1 text-xs text-v-text-subtle">
            <p>participantType: {participantInfo?.participantType ?? 'none'}</p>
            <p>schemaEnabled: {schema?.enabled ? 'true' : 'false'}</p>
            <p>fieldCount: {fields.length}</p>
            <p>source: informationFormSchema from /voter/events/:eventId/my-role</p>
          </div>
        </div>
        <p className="v-caption">Participant information form is hidden because the schema is disabled or empty.</p>
      </div>
    ) : null
  }

  return (
    <div className="space-y-3">
      <ParticipantInformationForm
        eventId={eventId}
        initialMetadata={participantInfo?.metadata}
        fields={fields}
      />
      {showDebugInfo && (
        <div className="v-card-sm border-v-border">
          <p className="text-sm font-medium text-v-text">Participant information debug</p>
          <div className="mt-2 space-y-1 text-xs text-v-text-subtle">
            <p>participantType: {participantInfo?.participantType ?? 'none'}</p>
            <p>schemaEnabled: {schema?.enabled ? 'true' : 'false'}</p>
            <p>fieldCount: {fields.length}</p>
            <p>source: informationFormSchema from /voter/events/:eventId/my-role</p>
          </div>
        </div>
      )}
    </div>
  )
}