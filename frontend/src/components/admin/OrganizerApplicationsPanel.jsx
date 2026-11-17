import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { adminService } from '@/services/admin.service'
import OrganizerApplicationReviewModal from '@/components/admin/OrganizerApplicationReviewModal'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import PageHeader from '@/components/ui/PageHeader'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { formatScope } from '@/utils/formatScope'

const STATUS_TONES = {
  pending: { tone: 'warning', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  declined: { tone: 'danger', label: 'Declined' },
}
const FILTERS = ['pending', 'approved', 'declined', 'all']

export default function OrganizerApplicationsPanel({ onChanged }) {
  const [applications, setApplications] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reviewId, setReviewId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminService.listOrganizerApplications(status === 'all' ? {} : { status })
      setApplications(data.applications ?? [])
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load applications'))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  const handleDone = async () => {
    setReviewId(null)
    await load()
    onChanged?.()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organizer applications"
        description="Review applications submitted through invitation links. Approving creates the organizer account."
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
          <div className="p-8 text-center v-caption">Loading applications…</div>
        ) : applications.length === 0 ? (
          <div className="p-8 text-center v-caption">
            {status === 'pending' ? 'No applications are waiting for review.' : 'No applications found.'}
          </div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Organization</th>
                  <th>Requested access</th>
                  <th>Certificates</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {applications.map((app) => {
                  const cfg = STATUS_TONES[app.status] ?? { tone: 'default', label: app.status }
                  return (
                    <tr key={app.id}>
                      <td>
                        <p className="font-medium text-v-text">{app.organizerName}</p>
                        <p className="v-caption">{app.position} · {app.email}</p>
                      </td>
                      <td>
                        <p className="text-v-text">{app.organizationName}</p>
                        <p className="v-caption">{app.organizationType}</p>
                      </td>
                      <td className="v-caption">{formatScope(app.requestedScope)}</td>
                      <td className="v-caption">{app.certificateCount}</td>
                      <td className="v-caption">{format(new Date(app.createdAt), 'MMM d, yyyy')}</td>
                      <td><Badge tone={cfg.tone}>{cfg.label}</Badge></td>
                      <td className="text-right">
                        <Button type="button" size="sm" variant={app.status === 'pending' ? 'primary' : 'secondary'} onClick={() => setReviewId(app.id)}>
                          {app.status === 'pending' ? 'Review' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <OrganizerApplicationReviewModal applicationId={reviewId} onClose={() => setReviewId(null)} onDone={handleDone} />
    </div>
  )
}
