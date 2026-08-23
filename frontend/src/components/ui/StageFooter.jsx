import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import SaveStatus from '@/components/ui/SaveStatus'
import { getNextStage, getPrevStage, stagePath } from '@/utils/eventStages'

export default function StageFooter({
  module,
  currentKey,
  eventId,
  saving = false,
  onNext,
  nextLabel,
  backLabel,
  showSidebarHint = true,
  nextPath,
  saveStatus = 'idle',
  lastSavedAt = null,
}) {
  const next = getNextStage(module, currentKey)
  const prev = getPrevStage(module, currentKey)

  const defaultNextHref = next ? stagePath(module, next.key, eventId) : null
  const nextHref = nextPath ?? defaultNextHref
  const prevHref = prev ? stagePath(module, prev.key, eventId) : null

  return (
    <div className="sticky bottom-0 z-40 -mx-4 -mb-20 mt-8 border-t border-v-border bg-v-surface shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:-mx-8 md:-mb-24">
      <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3 md:px-8">
        <div className="flex items-center gap-3">
        {prevHref ? (
          <Link to={prevHref}>
            <Button type="button" variant="secondary" disabled={saving}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              {backLabel ?? `Back: ${prev.label}`}
            </Button>
          </Link>
        ) : (
          showSidebarHint && (
            <p className="hidden text-xs text-v-text-subtle sm:block">
              Tip: use the sidebar to jump between sections.
            </p>
          )
        )}
      </div>

      <div className="flex items-center gap-3">
        {(saveStatus !== 'idle' || lastSavedAt) && (
          <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />
        )}

        {nextHref ? (
          onNext ? (
            <Button type="button" onClick={onNext} disabled={saving}>
              {saving ? 'Saving...' : nextLabel ?? `Next: ${next.label}`}
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          ) : (
            <Link to={nextHref}>
              <Button type="button" disabled={saving}>
                {nextLabel ?? `Next: ${next.label}`}
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </Link>
          )
        ) : (
          <span />
        )}
      </div>
      </div>
    </div>
  )
}
