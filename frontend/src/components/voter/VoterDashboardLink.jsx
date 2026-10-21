import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

const LINK_CLASS = 'inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-v-border bg-v-surface px-3 py-2 text-xs font-medium text-v-text-muted transition hover:border-v-primary/40 hover:bg-v-primary-soft/40 hover:text-v-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v-primary'

export default function VoterDashboardLink({ className = '' }) {
  return (
    <Link to="/participant" className={`${LINK_CLASS} ${className}`.trim()}>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      Back to dashboard
    </Link>
  )
}