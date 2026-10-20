import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import OrganizerManagementPage from './OrganizerManagementPage'
import VotersPanel from '@/components/admin/VotersPanel'
import JudgesPanel from '@/components/admin/JudgesPanel'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'

// Participant type pools remain separate views over shared user accounts.
const TABS = [
  { value: 'organizers', label: 'Organizers' },
  { value: 'participants', label: 'Participants' },
]

export default function UserManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const legacyParticipantTypes = {
    voters: 'election-voter',
    judges: 'competition-judge',
    respondents: 'polling-respondent',
  }
  const participantTypes = [
    { id: 'election-voter', label: 'Election Voters' },
    { id: 'competition-judge', label: 'Competition Judges' },
    { id: 'polling-respondent', label: 'Polling Respondents' },
  ]
  const requestedType = searchParams.get('type') || legacyParticipantTypes[requestedTab]
  const initialParticipantType = participantTypes.some((type) => type.id === requestedType)
    ? requestedType
    : participantTypes[0].id
  const initialTab = requestedTab === 'participants' || legacyParticipantTypes[requestedTab]
    ? 'participants'
    : 'organizers'
  const [tab, setTab] = useState(initialTab)
  const [participantType, setParticipantType] = useState(initialParticipantType)

  const selectTab = (nextTab) => {
    setTab(nextTab)
    setSearchParams(nextTab === 'participants'
      ? { tab: nextTab, type: participantType }
      : { tab: nextTab })
  }

  const selectParticipantType = (nextType) => {
    setParticipantType(nextType)
    setSearchParams({ tab: 'participants', type: nextType })
  }

  return (
    <div className="space-y-6">
      {tab === 'participants' && (
        <div data-module={participantType === 'competition-judge' ? 'competition-scoring' : participantType === 'polling-respondent' ? 'polling' : 'election'}>
          <PageHeader
            title="User management"
            description="Manage organizer accounts and participant pools."
          />
        </div>
      )}
      <Tabs tabs={TABS} value={tab} onChange={selectTab} label="User management" />

      {tab === 'organizers' && <OrganizerManagementPage />}
      {tab === 'participants' && (
        <div data-module={participantType === 'competition-judge' ? 'competition-scoring' : participantType === 'polling-respondent' ? 'polling' : 'election'} className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="v-section-title">Participant type</h2>
              <p className="v-caption mt-1">These are types within the Participant role. One account may have more than one type.</p>
            </div>
            <Tabs
              tabs={participantTypes.map((type) => ({ value: type.id, label: type.label }))}
              value={participantType}
              onChange={selectParticipantType}
              label="Participant type"
              className="w-full sm:w-auto"
            />
          </div>

          {participantType === 'election-voter' && <VotersPanel key="election-voters" pool="election" />}
          {participantType === 'competition-judge' && <JudgesPanel key="competition-judges" />}
          {participantType === 'polling-respondent' && <VotersPanel key="polling-respondents" pool="polling" />}
        </div>
      )}
    </div>
  )
}
