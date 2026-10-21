import { Pencil, Eye } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function StudentActionsMenu({ student, onStatusChange, onEdit, onViewDetails, savingId }) {
  const fullName = [student.firstName, student.lastName].filter(Boolean).join(' ')

  return (
    <div className="flex justify-end gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onEdit(student)}
      >
        <Pencil className="h-4 w-4" strokeWidth={1.5} /> Edit
      </Button>

      <Button
        size="sm"
        variant="secondary"
        loading={savingId === student.id}
        onClick={() =>
          onStatusChange({
            user: student,
            accountStatus: student.accountStatus === 'active' ? 'suspended' : 'active',
            label:
              student.accountStatus === 'active'
                ? 'Suspend'
                : student.accountStatus === 'archived'
                  ? 'Restore'
                  : 'Reinstate',
            name: fullName,
            email: student.email,
          })
        }
      >
        {student.accountStatus === 'active'
          ? 'Suspend'
          : student.accountStatus === 'archived'
            ? 'Restore'
            : 'Reinstate'}
      </Button>

      {student.accountStatus !== 'archived' && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onStatusChange({
              user: student,
              accountStatus: 'archived',
              label: 'Archive',
              name: fullName,
              email: student.email,
            })
          }
        >
          Archive
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => onViewDetails(student)}
      >
        <Eye className="h-4 w-4" strokeWidth={1.5} /> View
      </Button>
    </div>
  )
}
