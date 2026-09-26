import { useState } from 'react'
import OrganizerManagementPage from './OrganizerManagementPage'
import VotersPanel from '@/components/admin/VotersPanel'
import JudgesPanel from '@/components/admin/JudgesPanel'

// Plan Phase 3/4 (D14): the admin "Organizer Management" area becomes
// "User Management" with tabs. Organizers keeps the existing view; Voters is
// admin-owned student registration; Judges is admin-owned judge registration.
const TABS = [
  { id: 'organizers', label: 'Organizers' },
  { id: 'voters', label: 'Voters' },
  { id: 'judges', label: 'Judges' },
]

export default function UserManagementPage() {
  const [tab, setTab] = useState('organizers')

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
      {tab === 'voters' && <VotersPanel />}
      {tab === 'judges' && <JudgesPanel />}
    </div>
  )
}
