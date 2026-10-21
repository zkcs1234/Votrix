import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { EVENT_TYPE_META } from '@/services/voter.service'

// Existing module list/creation routes; there is no combined organizer Events
// route, so the menu fans out to each module's own flow.
export const EVENT_MODULES = [
  { key: 'election', label: EVENT_TYPE_META.election.label },
  { key: 'competition', label: EVENT_TYPE_META.competition_scoring.label },
  { key: 'polling', label: EVENT_TYPE_META.polling.label },
]

/**
 * Dropdown of the three modules. `create` links to each module's "new event"
 * route; otherwise to each module's events list ("See All").
 */
export default function CreateEventMenu({ create = false, label, showPlus = false }) {
  return (
    <details className="relative shrink-0">
      <summary
        className={`${create ? 'v-btn-primary' : 'v-btn-secondary'} min-h-10 cursor-pointer list-none`}
      >
        {showPlus && <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />}
        {label ?? (create ? 'Create Event' : 'See All')}
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-v-border bg-v-surface p-1 shadow-v-shadow-md">
        {EVENT_MODULES.map((module) => (
          <Link
            key={module.key}
            to={`/organizer/${module.key}/events${create ? '/new' : ''}`}
            className="block rounded-md px-3 py-2 text-sm text-v-text-muted hover:bg-v-surface-elevated"
          >
            {module.label}
          </Link>
        ))}
      </div>
    </details>
  )
}
