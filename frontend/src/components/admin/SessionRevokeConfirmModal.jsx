import { ShieldOff } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

export default function SessionRevokeConfirmModal({
  target,
  mode = 'single',
  onClose,
  onConfirm,
  loading = false,
}) {
  if (!target) return null

  const isAll = mode === 'all'
  const sessionCount = target.sessionCount ?? 1
  const title = isAll ? 'Sign out this user everywhere?' : 'Revoke this session?'
  const actionLabel = isAll ? 'Sign out everywhere' : 'Revoke session'

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-v-danger-soft p-2 text-v-danger">
            <ShieldOff className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-v-text">{target.email || 'Unknown user'}</p>
            <p className="v-caption mt-1">
              {isAll
                ? `${sessionCount} active session${sessionCount === 1 ? '' : 's'} will be revoked.`
                : 'This device will need to authenticate again when its current access expires.'}
            </p>
          </div>
        </div>

        <p className="v-caption">
          The action is recorded in the audit log. Existing access tokens may remain valid briefly
          until they expire, but the session cannot refresh afterward.
        </p>

        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} loading={loading}>
            {actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
