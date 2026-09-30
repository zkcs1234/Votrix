import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

const STATUS_MESSAGES = {
  suspended: 'This blocks the account from using protected areas. You can reinstate access later.',
  archived: 'This blocks access but keeps the account and its event history. You can restore it later.',
  active: 'This restores access to the account.',
}

export default function AccountStatusConfirmModal({ target, accountType, onClose, onConfirm, loading }) {
  if (!target) return null

  const label = target.label || (target.accountStatus === 'active' ? 'Restore' : 'Update status')

  return (
    <Modal open onClose={onClose} title={`${label} ${accountType.toLowerCase()}?`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-v-text">
          {target.name ? <span className="font-medium">{target.name} </span> : null}
          {target.email ? <span className="v-caption">({target.email})</span> : null}
        </p>
        <p className="v-caption">{STATUS_MESSAGES[target.accountStatus]}</p>
        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" variant={target.accountStatus === 'suspended' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {label}
          </Button>
        </div>
      </div>
    </Modal>
  )
}