import { Link } from 'react-router-dom'
import { ArrowRight, Briefcase } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getOfficership, isOfficer } from '@/utils/workspace'

// Entry point on the student dashboard for a student officer. Renders nothing
// for anyone else. (The student pages hide the sidebar, so a nav item alone
// would never be seen.)
export default function OfficerWorkspaceCard() {
  const { user } = useAuth()
  if (!isOfficer(user)) return null
  const officership = getOfficership(user)

  return (
    <div className="v-card-sm flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-v-primary" strokeWidth={1.5} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-v-text">
            {officership.position}
            {officership.organizationName ? ` · ${officership.organizationName}` : ''}
          </p>
          <p className="v-caption">You can manage this organization&apos;s events as an officer.</p>
        </div>
      </div>
      <Link
        to="/organizer"
        className="v-press inline-flex items-center gap-2 rounded-lg bg-v-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-v-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v-primary focus-visible:ring-offset-2 focus-visible:ring-offset-v-bg"
      >
        Open organizer workspace
        <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
      </Link>
    </div>
  )
}
