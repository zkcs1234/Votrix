import { Link } from 'react-router-dom'
import { ArrowLeft, UserCheck } from 'lucide-react'

// Shown across the organizer workspace to a student officer so it is always
// clear whose workspace they are in and that their actions are attributed to them.
export default function OfficerBanner({ officership }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-v-border bg-v-info-bg px-4 py-2 text-sm text-v-info md:px-8"
    >
      <p className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
        <span>
          You&apos;re working as <strong className="font-semibold">{officership.position}</strong> for{' '}
          <strong className="font-semibold">{officership.organizationName || 'this organization'}</strong>. Actions you take
          are recorded under your name.
        </span>
      </p>
      <Link to="/participant" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        Back to student view
      </Link>
    </div>
  )
}
