import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import OrganizerManagementPage from './OrganizerManagementPage'
import OrganizerInvitationsPanel from '@/components/admin/OrganizerInvitationsPanel'
import OrganizerApplicationsPanel from '@/components/admin/OrganizerApplicationsPanel'
import Tabs from '@/components/ui/Tabs'
import { adminService } from '@/services/admin.service'

// Sub-views of the Organizers page: the account list, the invitation links an
// admin has sent, and the applications waiting for review.
const ORGANIZER_SECTIONS = ['organizers', 'invitations', 'applications']

export default function OrganizersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const initialSection = ORGANIZER_SECTIONS.includes(requestedSection) ? requestedSection : 'organizers'

  const [section, setSection] = useState(initialSection)
  const [pendingApplications, setPendingApplications] = useState(null)

  const refreshPendingApplications = useCallback(() => {
    adminService
      .listOrganizerApplications({ status: 'pending', limit: 1 })
      .then(({ data }) => setPendingApplications(data.total ?? 0))
      .catch(() => setPendingApplications(null))
  }, [])

  useEffect(() => {
    refreshPendingApplications()
  }, [refreshPendingApplications])

  const selectSection = (nextSection) => {
    setSection(nextSection)
    setSearchParams(nextSection === 'organizers' ? {} : { section: nextSection })
  }

  return (
    <div className="space-y-5">
      <Tabs
        tabs={[
          { value: 'organizers', label: 'Accounts' },
          { value: 'invitations', label: 'Invitations' },
          { value: 'applications', label: 'Applications', count: pendingApplications || undefined },
        ]}
        value={section}
        onChange={selectSection}
        label="Organizer sections"
        variant="segmented"
        className="w-full sm:w-auto"
      />
      {section === 'organizers' && <OrganizerManagementPage />}
      {section === 'invitations' && <OrganizerInvitationsPanel onChanged={refreshPendingApplications} />}
      {section === 'applications' && <OrganizerApplicationsPanel onChanged={refreshPendingApplications} />}
    </div>
  )
}
