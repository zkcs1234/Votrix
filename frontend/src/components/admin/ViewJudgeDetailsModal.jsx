import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { DetailHeader, DetailRow, DetailSection, formatDateTime } from '@/components/admin/AccountDetailParts'

// Read-only details for a competition judge, laid out like the student modal.
// Judges are a global pool, so there is no organizer assignment to show.
export default function ViewJudgeDetailsModal({ judge, onClose }) {
  const fullName = [judge.firstName, judge.lastName].filter(Boolean).join(' ') || '—'
  const profile = judge.profileData ?? {}

  return (
    <Modal open onClose={onClose} title="Judge Details" size="md">
      <div className="space-y-6">
        <DetailHeader name={fullName} email={judge.email} status={judge.accountStatus} />

        <DetailSection title="Judge Information">
          <DetailRow label="Title" value={profile.title} />
          <DetailRow label="Affiliation" value={profile.affiliation} />
          <DetailRow label="Expertise" value={profile.expertise} />
        </DetailSection>

        <DetailSection title="Account Information">
          <DetailRow label="Created" value={formatDateTime(judge.createdAt)} />
          <DetailRow label="User ID" value={judge.id} />
        </DetailSection>

        <div className="flex justify-end border-t border-v-border pt-4">
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
