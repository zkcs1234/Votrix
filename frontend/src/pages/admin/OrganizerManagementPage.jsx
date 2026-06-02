import { useState, useEffect } from 'react'
import { adminService } from '@/services/admin.service'
import CreateOrganizerModal from '@/components/admin/CreateOrganizerModal'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import SearchInput from '@/components/ui/SearchInput'
import { format } from 'date-fns'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

function TableSkeleton() {
  return (
    <div className="v-table-wrap">
      <table className="v-table">
        <thead>
          <tr>
            <th>
              <div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th>
              <div className="h-4 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
            <th className="text-right">
              <div className="h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-v-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="hover:bg-v-surface-elevated/50">
              <td>
                <div className="h-4 w-40 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td>
                <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
              </td>
              <td>
                <div className="flex gap-2">
                  <div className="h-6 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
                  <div className="h-6 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
                </div>
              </td>
              <td className="text-right">
                <div className="h-6 w-12 animate-pulse rounded-lg bg-v-surface-elevated ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function OrganizerManagementPage() {
  const [organizers, setOrganizers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  const fetchOrganizers = async () => {
    try {
      setLoading(true)
      const { data } = await adminService.getOrganizers()
      setOrganizers(data.organizers || [])
      setError(null)
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

  const filteredOrganizers = organizers.filter((org) => {
    const searchLower = search.toLowerCase()
    return (
      org.email.toLowerCase().includes(searchLower) ||
      org.organizations?.some((o) => o.organization_name.toLowerCase().includes(searchLower))
    )
  })

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="h-8 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-lg bg-v-surface-elevated" />
        </div>

        <div className="h-10 w-80 animate-pulse rounded-lg bg-v-surface-elevated" />

        <Card padding="sm">
          <TableSkeleton />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="v-page-title">Organizer Management</h1>
          <p className="v-caption">Manage organizer accounts and their organizations.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>Create Organizer</Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <SearchInput
          placeholder="Search organizers by email or organization..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-80"
        />
      </div>

      <Card padding="sm">
        {error ? (
          <div className="p-8 text-center text-v-danger">{error}</div>
        ) : filteredOrganizers.length === 0 ? (
          <div className="p-8 text-center v-caption">
            {search ? 'No organizers found matching your search' : 'No organizers found.'}
          </div>
        ) : (
          <div className="v-table-wrap">
            <table className="v-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Created At</th>
                  <th>Organizations</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v-border">
                {filteredOrganizers.map((org) => (
                  <tr key={org.id} className="hover:bg-v-surface-elevated/50">
                    <td className="font-medium">{org.email}</td>
                    <td className="v-caption">
                      {format(new Date(org.created_at), 'MMM d, yyyy')}
                    </td>
                    <td>
                      {org.organizations?.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {org.organizations.map(o => (
                            <span key={o.id} className="v-badge">
                              {o.organization_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="v-caption">None</span>
                      )}
                    </td>
                    <td className="text-right">
                      <button className="v-btn-tertiary text-sm">Edit</button>
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