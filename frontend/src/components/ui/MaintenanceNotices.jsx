import { Link } from 'react-router-dom'
import { Wrench } from 'lucide-react'

// Shown on the sign-in pages while maintenance mode is on, so a non-admin knows
// why signing in will be refused (and an admin knows they are in the right place).
export function MaintenanceLoginBanner() {
  return (
    <div role="status" className="mb-5 flex items-start gap-2 rounded-lg border border-v-warning/40 bg-v-warning-bg p-3 text-sm text-v-warning">
      <Wrench className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
      <p>Maintenance mode is on. Only administrators can sign in right now.</p>
    </div>
  )
}

// Shown to administrators while maintenance mode is on: everyone else is locked
// out, which is easy to forget.
export function MaintenanceAdminNotice() {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-v-border bg-v-warning-bg px-4 py-2 text-sm text-v-warning md:px-8">
      <p className="flex items-center gap-2">
        <Wrench className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
        <span>
          <strong className="font-semibold">Maintenance mode is on.</strong> Only administrators can use the platform.
        </span>
      </p>
      <Link to="/admin/settings" className="font-medium underline-offset-2 hover:underline">
        Turn it off
      </Link>
    </div>
  )
}
