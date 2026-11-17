import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { DetailHeader, DetailRow, DetailSection, formatDateTime } from '@/components/admin/AccountDetailParts'

// Students automatically take part in elections and polls (one STUDENT type), and
// the Students page already says so, so this modal does not repeat participant types.
export default function ViewStudentDetailsModal({ student, onClose }) {
  const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ') || '—'

  return (
    <Modal open onClose={onClose} title="Student Details" size="md">
      <div className="space-y-6">
        <DetailHeader name={fullName} email={student.email} status={student.accountStatus} />

        <DetailSection title="Student Information">
          <DetailRow label="School ID" value={student.schoolId} />
          <DetailRow label="Program" value={student.program} />
        </DetailSection>

        <DetailSection title="Account Information">
          <DetailRow label="Created" value={formatDateTime(student.createdAt)} />
          <DetailRow label="Last Updated" value={formatDateTime(student.updatedAt)} />
          <DetailRow label="User ID" value={student.id} />
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
