import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import OrganizerManagementPage from './OrganizerManagementPage'
import VotersPanel from '@/components/admin/VotersPanel'
import JudgesPanel from '@/components/admin/JudgesPanel'

// Participant type pools remain separate views over shared user accounts.
const TABS = [
  { id: 'organizers', label: 'Organizers' },
  { id: 'voters', label: 'Election Voters' },
  { id: 'judges', label: 'Competition Judges' },
  { id: 'respondents', label: 'Polling Respondents' },
]

export default function UserManagementPage() {
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab = TABS.some((item) => item.id === requestedTab) ? requestedTab : 'organizers'
  const [tab, setTab] = useState(initialTab)

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="User management" className="flex gap-1 border-b border-v-border">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                active
                  ? 'border-v-primary text-v-text'
                  : 'border-transparent text-v-text-muted hover:text-v-text'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'organizers' && <OrganizerManagementPage />}
      {tab === 'voters' && <VotersPanel key="election-voters" pool="election" />}
      {tab === 'judges' && <JudgesPanel />}
      {tab === 'respondents' && <VotersPanel key="polling-respondents" pool="polling" />}
    </div>
  )
}
