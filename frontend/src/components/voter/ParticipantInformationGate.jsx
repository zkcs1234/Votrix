import { useEffect, useState, useMemo } from 'react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ParticipantInformationForm from '@/components/voter/ParticipantInformationForm'
import { voterService } from '@/services/voter.service'

export default function ParticipantInformationGate({ eventId }) {
  const [participantInfo, setParticipantInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(true)

  useEffect(() => {
    let alive = true

    setLoading(true)
    voterService
      .getMyEventRole(eventId)
      .then(({ data }) => {
        if (alive) {
          setParticipantInfo(data)
        }
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

  const schema = participantInfo?.informationFormSchema
  const fields = schema?.fields ?? []
  const showDebugInfo = import.meta.env.DEV

  // Check if form is already completely filled based on required fields
  useEffect(() => {
    if (participantInfo && fields.length > 0) {
      const meta = participantInfo?.metadata ?? {}
      const isComplete = fields.every((f) => {
        if (!f.required) return true
        const val = meta[f.id]
        // treat false (checkbox) and 0 (number) as filled; only undefined/null/''/missing is incomplete
        return val !== undefined && val !== null && val !== ''
      })
      setIsOpen(!isComplete)
    }
  }, [participantInfo, fields])

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-xl bg-v-surface p-6 shadow-2xl text-center">
          <LoadingSpinner />
          <p className="v-caption mt-3">Loading participant information...</p>
        </div>
      </div>
    )
  }

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

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl bg-v-surface shadow-2xl">
        <ParticipantInformationForm
          eventId={eventId}
          initialMetadata={participantInfo?.metadata}
          fields={fields}
          onSuccess={(savedMetadata) => {
            // Update participantInfo with the saved metadata so the
            // isComplete useEffect evaluates the fresh data and keeps
            // the form closed instead of re-opening it.
            setParticipantInfo((prev) => ({
              ...prev,
              metadata: savedMetadata,
            }))
          }}
        />
        {showDebugInfo && (
          <div className="p-4 border-t border-v-border">
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
    </div>
  )
}