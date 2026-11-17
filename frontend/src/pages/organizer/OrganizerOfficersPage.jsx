import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { format } from 'date-fns'
import { UserPlus } from 'lucide-react'
import AddOfficerModal, { studentName } from '@/components/organizer/AddOfficerModal'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import Modal from '@/components/ui/Modal'
import PageHeader from '@/components/ui/PageHeader'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { organizerOfficersService } from '@/services/organizer-officers.service'
import { USER_ROLES } from '@/utils/constants'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { INPUT_CLASS } from '@/utils/uiClasses'

const FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
]
const STATUS_TONES = { active: 'success', inactive: 'default' }

function errorText(err, fallback) {
  const details = err.response?.data?.details?.errors
  return details?.length ? details.join('; ') : getErrorMessage(err, fallback)
}

// "Account Manager": the organizer assigns students to act as officers inside
// this organization's workspace. Owner-only — an officer is redirected away.
export default function OrganizerOfficersPage() {
  const { role } = useAuth()
  const { success, error: toastError } = useToast()
  const [officers, setOfficers] = useState([])
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [positionDraft, setPositionDraft] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [modalError, setModalError] = useState(null)

  const isOwner = role === USER_ROLES.ORGANIZER

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await organizerOfficersService.list({ status })
      setOfficers(data.officers ?? [])
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load officers'))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    if (isOwner) void load()
  }, [isOwner, load])

  if (!isOwner) return <Navigate to="/organizer" replace />

  const openEdit = (officer) => {
    setEditTarget(officer)
    setPositionDraft(officer.position)
    setModalError(null)
  }

  const savePosition = async (e) => {
    e.preventDefault()
    setBusyId(editTarget.id)
    setModalError(null)
    try {
      await organizerOfficersService.updatePosition(editTarget.id, positionDraft.trim())
      success('Position updated')
      setEditTarget(null)
      await load()
    } catch (err) {
      setModalError(errorText(err, 'Could not update the position'))
    } finally {
      setBusyId(null)
    }
  }

  const confirmDeactivate = async () => {
    const target = deactivateTarget
    setBusyId(target.id)
    try {
      await organizerOfficersService.deactivate(target.id)
      success('Officer deactivated. Their access ended immediately.')
      setDeactivateTarget(null)
      await load()
    } catch (err) {
      toastError(errorText(err, 'Could not deactivate the officer'))
    } finally {
      setBusyId(null)
    }
  }

  const activate = async (officer) => {
    setBusyId(officer.id)
    try {
      await organizerOfficersService.activate(officer.id)
      success('Officer activated')
      await load()
    } catch (err) {
      toastError(errorText(err, 'Could not activate the officer'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Manager"
        description="Give students access to manage this organization's events. Officers act on your behalf, and everything they do is recorded under their name."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" strokeWidth={2} />
            Add officer
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            variant={status === f.value ? 'primary' : 'secondary'}
            onClick={() => setStatus(f.value)}
            aria-pressed={status === f.value}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}

      <Card padding="sm">
        {loading ? (
          <div className="p-8 text-center v-caption">Loading officers…</div>
        ) : officers.length === 0 ? (
          <div className="p-8 text-center v-caption">
            {status === 'active' ? 'No active officers yet. Use “Add officer” to assign a student.' : 'No officers found.'}
          </div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Program</th>
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
                      <p className="font-medium text-v-text">{studentName(o.student)}</p>
                      <p className="v-caption">{o.student?.email}</p>
                    </td>
                    <td className="v-caption">
                      {o.student?.program || '—'}
                    </td>
                    <td className="text-v-text">{o.position}</td>
                    <td className="v-caption">{o.assignedAt ? format(new Date(o.assignedAt), 'MMM d, yyyy') : '—'}</td>
                    <td>
                      <Badge tone={STATUS_TONES[o.status] ?? 'default'}>{o.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => openEdit(o)}>Edit position</Button>
                        {o.status === 'active' ? (
                          <Button type="button" size="sm" variant="danger" onClick={() => setDeactivateTarget(o)}>Deactivate</Button>
                        ) : (
                          <Button type="button" size="sm" variant="secondary" loading={busyId === o.id} onClick={() => activate(o)}>
                            Activate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddOfficerModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSuccess={load} />

      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit position" size="sm">
        <form className="space-y-4" onSubmit={savePosition}>
          <p className="text-sm text-v-text">{editTarget ? studentName(editTarget.student) : ''}</p>
          <div>
            <label htmlFor="edit-position" className="v-label">Position</label>
            <input
              id="edit-position"
              value={positionDraft}
              onChange={(e) => setPositionDraft(e.target.value)}
              className={INPUT_CLASS}
              maxLength={255}
              required
            />
          </div>
          {modalError && <FormAlert variant="error">{modalError}</FormAlert>}
          <div className="flex justify-end gap-2 border-t border-v-border pt-4">
            <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" loading={busyId === editTarget?.id} disabled={!positionDraft.trim()}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deactivateTarget)} onClose={() => setDeactivateTarget(null)} title="Deactivate officer?" size="sm">
        <p className="text-sm text-v-text">
          <span className="font-medium">{deactivateTarget ? studentName(deactivateTarget.student) : ''}</span> will lose access
          to this organization&apos;s workspace immediately. They stay a student and keep voting and responding as before. You
          can activate them again later.
        </p>
        <div className="mt-5 flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
          <Button type="button" variant="danger" loading={busyId === deactivateTarget?.id} onClick={confirmDeactivate}>
            Deactivate
          </Button>
        </div>
      </Modal>
    </div>
  )
}
