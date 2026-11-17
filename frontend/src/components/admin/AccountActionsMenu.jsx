import { Pencil, Eye, Mail } from 'lucide-react'
import Button from '@/components/ui/Button'

/**
 * The row actions for every account list in Admin → Organizers and Participants (Students,
 * Judges, Organizers), so they stay identical:
 *
 *   Edit · Restore (only when not active) · Archive (only when not archived) · View
 *
 * There is deliberately no "Suspend": archiving covers it. A legacy account that
 * is still suspended can be brought back with "Restore".
 *
 * `onStatusChange` receives just the requested change ({ accountStatus, label });
 * each panel adds its own account details before confirming. `busyStatus` is the
 * status currently being saved for this row (or null).
 *
 * `onResend` is optional: when given, a "Resend" button emails a fresh temporary
 * password. Panels pass it only for accounts that have not yet signed in.
 */
export default function AccountActionsMenu({ status, onEdit, onView, onStatusChange, busyStatus = null, onResend, resending = false }) {
  return (
    // Rows can be clickable (organizers); actions must not trigger the row click.
    // One line, always: no wrapping, so the table's Actions column sizes itself to
    // fit every button (a wrapped "View" under Edit/Archive looked broken).
    <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="ghost" onClick={onEdit}>
        <Pencil className="h-4 w-4" strokeWidth={1.5} /> Edit
      </Button>

      {onResend && (
        <Button
          size="sm"
          variant="secondary"
          loading={resending}
          onClick={onResend}
          title="Email a new temporary password"
        >
          <Mail className="h-4 w-4" strokeWidth={1.5} /> Resend
        </Button>
      )}

      {status !== 'active' && (
        <Button
          size="sm"
          variant="secondary"
          loading={busyStatus === 'active'}
          onClick={() => onStatusChange({ accountStatus: 'active', label: 'Restore' })}
        >
          Restore
        </Button>
      )}

      {status !== 'archived' && (
        <Button
          size="sm"
          variant="secondary"
          loading={busyStatus === 'archived'}
          onClick={() => onStatusChange({ accountStatus: 'archived', label: 'Archive' })}
        >
          Archive
        </Button>
      )}

      <Button size="sm" variant="ghost" onClick={onView}>
        <Eye className="h-4 w-4" strokeWidth={1.5} /> View
      </Button>
    </div>
  )
}
