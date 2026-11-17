import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import Modal from '@/components/ui/Modal'
import { adminService } from '@/services/admin.service'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

const name = (s) => [s?.firstName, s?.lastName].filter(Boolean).join(' ') || s?.email || 'Student'

// Read-only list of an organizer's student officers, with an admin override to
// deactivate one (for example if the organizer cannot be reached).
export default function OrganizerOfficersCard({ organizerId }) {
  const [officers, setOfficers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [target, setTarget] = useState(null)
  const [busy, setBusy] = useState(false)
  const { success, error: toastError } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminService.getOrganizerOfficers(organizerId)
      setOfficers(data.officers ?? [])
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load officers'))
    } finally {
      setLoading(false)
    }
  }, [organizerId])

  useEffect(() => {
    void load()
  }, [load])

  const deactivate = async () => {
    setBusy(true)
    try {
      await adminService.deactivateOrganizerOfficer(organizerId, target.id)
      success('Officer deactivated')
      setTarget(null)
      await load()
    } catch (err) {
      toastError(getErrorMessage(err, 'Could not deactivate the officer'))
    } finally {
      setBusy(false)
    }
  }

  const active = officers.filter((o) => o.status === 'active').length

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="v-section-title">Student officers</h2>
        {!loading && !error && <span className="v-caption">{active} active of {officers.length}</span>}
      </div>

      {error && <div className="mt-3"><FormAlert variant="error">{error}</FormAlert></div>}
      {loading && <p className="mt-3 v-caption">Loading officers…</p>}
      {!loading && !error && officers.length === 0 && (
        <p className="mt-3 v-caption">This organizer has not assigned any student officers.</p>
      )}

      {officers.length > 0 && (
        <div className="v-table-wrap mt-3">
          <table className="v-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Position</th>
                <th>Assigned</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-v-border">
              {officers.map((o) => (
                <tr key={o.id}>
                  <td>
                    <p className="font-medium text-v-text">{name(o.student)}</p>
                    <p className="v-caption">{o.student?.email}</p>
                  </td>
                  <td className="text-v-text">{o.position}</td>
                  <td className="v-caption">{o.assignedAt ? format(new Date(o.assignedAt), 'MMM d, yyyy') : '—'}</td>
                  <td><Badge tone={o.status === 'active' ? 'success' : 'default'}>{o.status === 'active' ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="text-right">
                    {o.status === 'active' && (
                      <Button type="button" size="sm" variant="danger" onClick={() => setTarget(o)}>Deactivate</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(target)} onClose={() => setTarget(null)} title="Deactivate officer?" size="sm">
        <p className="text-sm text-v-text">
          <span className="font-medium">{target ? name(target.student) : ''}</span> will lose access to this organizer&apos;s
          workspace immediately. This is recorded as an administrator action.
        </p>
        <div className="mt-5 flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
          <Button type="button" variant="danger" loading={busy} onClick={deactivate}>Deactivate</Button>
        </div>
      </Modal>
    </Card>
  )
}
