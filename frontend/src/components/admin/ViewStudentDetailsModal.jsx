import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

const STATUS_TONE = { active: 'success', suspended: 'danger', archived: 'default' }

function DetailRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-v-border py-3">
      <span className="text-sm font-medium text-v-text-secondary">{label}</span>
      <span className="text-sm text-v-text">{value || '—'}</span>
    </div>
  )
}

export default function ViewStudentDetailsModal({ student, onClose }) {
  const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ') || '—'
  
  return (
    <Modal open onClose={onClose} title="Student Details" size="md">
      <div className="space-y-6">
        {/* Header with name and status */}
        <div className="rounded-lg border border-v-border bg-v-surface-elevated p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-v-text">{fullName}</h3>
              <p className="text-sm text-v-text-secondary">{student.email}</p>
            </div>
            <Badge tone={STATUS_TONE[student.accountStatus] || 'default'}>
              {student.accountStatus}
            </Badge>
          </div>
        </div>

        {/* Participant Types */}
        <fieldset className="space-y-2">
          <legend className="v-section-title">Participant Types</legend>
          <div className="rounded-lg border border-v-border bg-v-surface p-3">
            <div className="flex flex-wrap gap-2">
              {student.hasVoterType && (
                <Badge tone="info">Election Voter</Badge>
              )}
              {student.hasRespondentType && (
                <Badge tone="success">Polling Respondent</Badge>
              )}
              {!student.hasVoterType && !student.hasRespondentType && (
                <span className="text-sm text-v-text-tertiary">No participant types</span>
              )}
            </div>
          </div>
        </fieldset>

        {/* Student Information */}
        <fieldset className="space-y-2">
          <legend className="v-section-title">Student Information</legend>
          <div className="rounded-lg border border-v-border bg-v-surface">
            <DetailRow label="School ID" value={student.schoolId} />
            <DetailRow label="Program" value={student.program} />
            <DetailRow label="Year & Section" value={student.yearSection} />
          </div>
        </fieldset>

        {/* Account Information */}
        <fieldset className="space-y-2">
          <legend className="v-section-title">Account Information</legend>
          <div className="rounded-lg border border-v-border bg-v-surface">
            <DetailRow 
              label="Created" 
              value={student.createdAt ? new Date(student.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : '—'}
            />
            <DetailRow 
              label="Last Updated" 
              value={student.updatedAt ? new Date(student.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : '—'}
            />
            <DetailRow label="User ID" value={student.id} />
          </div>
        </fieldset>

        {/* Actions */}
        <div className="flex justify-end border-t border-v-border pt-4">
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
