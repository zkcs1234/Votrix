import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Mail, Send } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import InviteOrganizerModal from '@/components/admin/InviteOrganizerModal'
import InvitationLinkResult from '@/components/admin/InvitationLinkResult'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

const STATUS_TONES = {
  pending: { tone: 'info', label: 'Pending' },
  used: { tone: 'success', label: 'Used' },
  expired: { tone: 'default', label: 'Expired' },
  revoked: { tone: 'danger', label: 'Revoked' },
}
const FILTERS = ['all', 'pending', 'expired', 'used', 'revoked']

const fmt = (iso) => (iso ? format(new Date(iso), 'MMM d, yyyy') : '—')

export default function OrganizerInvitationsPanel({ onChanged }) {
  const [invitations, setInvitations] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [linkResult, setLinkResult] = useState(null)
  const { success, error: toastError } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminService.listOrganizerInvitations(status === 'all' ? {} : { status })
      setInvitations(data.invitations ?? [])
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load invitations'))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = async () => {
    await load()
    onChanged?.()
  }

  const handleRevoke = async () => {
    const target = revokeTarget
    setBusyId(target.id)
    try {
      await adminService.revokeOrganizerInvitation(target.id)
      success('Invitation revoked')
      setRevokeTarget(null)
      await refresh()
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not revoke the invitation'))
    } finally {
      setBusyId(null)
    }
  }

  const handleResend = async (invitation) => {
    setBusyId(invitation.id)
    try {
      const { data } = await adminService.resendOrganizerInvitation(invitation.id)
      success('New invitation created')
      setLinkResult({ recipient: data.invitation.email, email: data.email, applyUrl: data.applyUrl })
      await refresh()
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not resend the invitation'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizer invitations"
        description="Invite someone to apply as an organizer. Each link works once and expires."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Send className="h-4 w-4" strokeWidth={2} />
            Invite organizer
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f}
            type="button"
            variant={status === f ? 'primary' : 'secondary'}
            onClick={() => setStatus(f)}
            aria-pressed={status === f}
          >
            {f === 'all' ? 'All' : STATUS_TONES[f].label}
          </Button>
        ))}
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Card padding="sm">
        {loading ? (
          <div className="p-8 text-center v-caption">Loading invitations…</div>
        ) : invitations.length === 0 ? (
          <div className="p-8 text-center v-caption">No invitations found.</div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {invitations.map((inv) => {
                  const cfg = STATUS_TONES[inv.status] ?? { tone: 'default', label: inv.status }
                  const canRevoke = inv.status === 'pending'
                  const canResend = inv.status !== 'used'
                  return (
                    <tr key={inv.id}>
                      <td>
                        <p className="font-medium text-v-text">{inv.email}</p>
                        {inv.note && <p className="v-caption line-clamp-1">{inv.note}</p>}
                      </td>
                      <td><Badge tone={cfg.tone}>{cfg.label}</Badge></td>
                      <td className="v-caption">{fmt(inv.expiresAt)}</td>
                      <td className="v-caption">{fmt(inv.createdAt)}</td>
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {canResend && (
                            <Button type="button" size="sm" variant="secondary" loading={busyId === inv.id} onClick={() => handleResend(inv)}>
                              <Mail className="h-4 w-4" strokeWidth={1.5} /> Resend
                            </Button>
                          )}
                          {canRevoke && (
                            <Button type="button" size="sm" variant="danger" disabled={busyId === inv.id} onClick={() => setRevokeTarget(inv)}>
                              Revoke
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InviteOrganizerModal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} onSuccess={refresh} />

      <Modal open={Boolean(revokeTarget)} onClose={() => setRevokeTarget(null)} title="Revoke invitation" size="sm">
        <p className="text-sm text-v-text">
          Revoke the invitation for <span className="font-medium">{revokeTarget?.email}</span>? The link will stop working immediately.
        </p>
        <div className="mt-5 flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={() => setRevokeTarget(null)}>Cancel</Button>
          <Button type="button" variant="danger" loading={busyId === revokeTarget?.id} onClick={handleRevoke}>Revoke invitation</Button>
        </div>
      </Modal>

      <Modal open={Boolean(linkResult)} onClose={() => setLinkResult(null)} title="New invitation link" size="md">
        {linkResult && <InvitationLinkResult {...linkResult} onDone={() => setLinkResult(null)} />}
      </Modal>
    </div>
  )
}
