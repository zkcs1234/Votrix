import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import OrganizerManagementPage from './OrganizerManagementPage'
import VotersPanel from '@/components/admin/VotersPanel'
import JudgesPanel from '@/components/admin/JudgesPanel'
import PageHeader from '@/components/ui/PageHeader'

// Participant type pools remain separate views over shared user accounts.
const TABS = [
  { id: 'organizers', label: 'Organizers' },
  { id: 'participants', label: 'Participants' },
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
    { id: 'election-voter', label: 'Election Voter' },
    { id: 'competition-judge', label: 'Competition Judge' },
    { id: 'polling-respondent', label: 'Polling Respondent' },
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
      <div role="tablist" aria-label="User management" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-v-border bg-v-surface p-1">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => selectTab(t.id)}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-v-primary text-white shadow-sm'
                  : 'text-v-text-muted hover:bg-v-surface-elevated hover:text-v-text'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'organizers' && <OrganizerManagementPage />}
      {tab === 'participants' && (
        <div data-module={participantType === 'competition-judge' ? 'competition-scoring' : participantType === 'polling-respondent' ? 'polling' : 'election'} className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="v-section-title">Participant type</h2>
              <p className="v-caption mt-1">These are types within the Participant role. One account may have more than one type.</p>
            </div>
            <div role="tablist" aria-label="Participant type" className="grid w-full grid-cols-1 gap-1 rounded-xl border border-v-border bg-v-surface p-1 sm:w-auto sm:grid-cols-3">
              {participantTypes.map((type) => {
                const active = participantType === type.id
                const moduleName = type.id === 'competition-judge'
                  ? 'competition-scoring'
                  : type.id === 'polling-respondent' ? 'polling' : 'election'
                return (
                  <span key={type.id} data-module={moduleName}>
                    <button
                      role="tab"
                      type="button"
                      aria-selected={active}
                      onClick={() => selectParticipantType(type.id)}
                      className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                        active
                          ? 'bg-v-primary text-white shadow-sm'
                          : 'text-v-text-muted hover:bg-v-surface-elevated hover:text-v-text'
                      }`}
                    >
                      {type.label}
                    </button>
                  </span>
                )
              })}
            </div>
          </div>

          {participantType === 'election-voter' && <VotersPanel key="election-voters" pool="election" />}
          {participantType === 'competition-judge' && <JudgesPanel key="competition-judges" />}
          {participantType === 'polling-respondent' && <VotersPanel key="polling-respondents" pool="polling" />}
        </div>
      )}
    </div>
  )
}
