import { Link } from 'react-router-dom'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { DetailHeader, DetailRow, DetailSection, formatDateTime } from '@/components/admin/AccountDetailParts'
import { formatScope } from '@/utils/formatScope'

// Read-only details for an organizer, laid out like the student and judge modals.
// `organizer` is the row the Accounts list already holds (snake_case columns).
export default function ViewOrganizerDetailsModal({ organizer, onClose }) {
  return (
    <Modal open onClose={onClose} title="Organizer Details" size="md">
      <div className="space-y-6">
        <DetailHeader name={organizer.organizer_name} email={organizer.email} status={organizer.account_status || 'active'} />

        <DetailSection title="Organization">
          <DetailRow label="Organization name" value={organizer.organization_name} />
          <DetailRow label="Organization type" value={organizer.organization_type_display} />
          <DetailRow label="Position" value={organizer.position} />
          <DetailRow label="Student access" value={formatScope(organizer.scope)} />
        </DetailSection>

        <DetailSection title="Account Information">
          <DetailRow label="Created" value={formatDateTime(organizer.created_at)} />
          <DetailRow label="User ID" value={organizer.id} />
        </DetailSection>

        <div className="flex flex-wrap justify-between gap-2 border-t border-v-border pt-4">
          <Link
            to={`/admin/organizers/${organizer.id}`}
            className="v-press inline-flex items-center rounded-lg border border-v-border-strong bg-v-surface px-4 py-2 text-sm font-medium text-v-text hover:bg-v-surface-elevated"
          >
            Activity &amp; student officers
          </Link>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
