import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ParticipantInformationForm from '@/components/voter/ParticipantInformationForm'
import { voterService } from '@/services/voter.service'

export default function ParticipantInformationGate({ eventId }) {
  const [participantInfo, setParticipantInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false) // Start as false, only open if incomplete

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
  // Stabilise the fields array reference with useMemo so the completeness
  // useEffect below doesn't re-run on every render due to a new [] reference.
  const fields = useMemo(() => schema?.fields ?? [], [schema])
  const showDebugInfo = import.meta.env.DEV

  // Check if form is already completely filled based on required fields.
  // Runs whenever participantInfo (metadata) or the field definitions change.
  useEffect(() => {
    if (!participantInfo) return
    if (fields.length === 0) return

    const meta = participantInfo.metadata ?? {}
    const isComplete = fields.every((f) => {
      if (!f.required) return true
      const val = meta[f.id]
      // treat false (checkbox) and 0 (number) as filled; only undefined/null/'' is incomplete
      return val !== undefined && val !== null && val !== ''
    })
    setIsOpen(!isComplete)
  }, [participantInfo, fields])

  // Don't show loading spinner - just wait silently until we know if form is needed
  // This prevents the flash of loading modal when form is already complete
  if (loading) {
    return null
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

  return createPortal(
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
    </div>,
    document.body,
  )
}