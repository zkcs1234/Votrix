import { useState, useEffect } from 'react'
import { adminService } from '@/services/admin.service'
import CreateOrganizerModal from '@/components/admin/CreateOrganizerModal'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'

export default function OrganizerManagementPage() {
  const [organizers, setOrganizers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchOrganizers = async () => {
    try {
      setLoading(true)
      const { data } = await adminService.getOrganizers()
      setOrganizers(data.organizers || [])
    } catch (err) {
      setError('Failed to load organizers')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrganizers()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-v-text">Organizer Management</h1>
          <p className="text-v-text-subtle">Manage organizer accounts and their organizations.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>Create Organizer</Button>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-v-text-subtle">Loading organizers...</div>
        ) : error ? (
          <div className="p-8 text-center text-v-danger">{error}</div>
        ) : organizers.length === 0 ? (
          <div className="p-8 text-center text-v-text-subtle">No organizers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-v-text">
              <thead className="bg-v-surface-elevated text-xs font-semibold uppercase text-v-text-subtle">
                <tr>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Created At</th>
                  <th className="px-6 py-4">Organizations</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {organizers.map((org) => (
                  <tr key={org.id} className="hover:bg-v-surface-elevated/50">
                    <td className="px-6 py-4 font-medium">{org.email}</td>
                    <td className="px-6 py-4">
                      {format(new Date(org.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4">
                      {org.organizations?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {org.organizations.map(o => (
                            <span key={o.id} className="inline-flex items-center rounded-full bg-v-primary/10 px-2.5 py-0.5 text-xs font-medium text-v-primary">
                              {o.organization_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-v-text-muted">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-v-primary hover:text-v-primary-hover">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateOrganizerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={fetchOrganizers}
      />
    </div>
  )
}
