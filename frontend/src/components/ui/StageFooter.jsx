import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
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
}) {
  const next = getNextStage(module, currentKey)
  const prev = getPrevStage(module, currentKey)

  const defaultNextHref = next ? stagePath(module, next.key, eventId) : null
  const nextHref = nextPath ?? defaultNextHref
  const prevHref = prev ? stagePath(module, prev.key, eventId) : null

  return (
    <div className="mt-8 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v-border pt-4">
        {prevHref ? (
          <Link to={prevHref}>
            <Button type="button" variant="secondary" disabled={saving}>
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              {backLabel ?? `Back: ${prev.label}`}
            </Button>
          </Link>
        ) : (
          <span />
        )}

        {nextHref ? (
          next.path === null ? null : onNext ? (
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

      {showSidebarHint && (
        <p className="text-xs text-v-text-subtle">
          Tip: you can also jump to any section using the sidebar.
        </p>
      )}
    </div>
  )
}
