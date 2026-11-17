import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SystemSettingsPage from './SystemSettingsPage'
import AlertConfigPage from './AlertConfigPage'
import ArchivalPolicyPage from './ArchivalPolicyPage'
import HealthDashboardPage from './HealthDashboardPage'
import Tabs from '@/components/ui/Tabs'

// One home for platform configuration and monitoring. Each tab keeps its own
// load/save behaviour; only the entry point is shared. The tab is kept in the
// URL (?section=...) so the old /admin/health, /admin/alerts and
// /admin/archival links can redirect straight to the right tab.
const SYSTEM_TABS = [
  { value: 'settings', label: 'Settings' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'archival', label: 'Archival policy' },
  { value: 'health', label: 'System health' },
]
const SYSTEM_SECTIONS = SYSTEM_TABS.map((tab) => tab.value)

export default function SystemPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedSection = searchParams.get('section')
  const [section, setSection] = useState(SYSTEM_SECTIONS.includes(requestedSection) ? requestedSection : 'settings')

  const selectSection = (nextSection) => {
    setSection(nextSection)
    setSearchParams(nextSection === 'settings' ? {} : { section: nextSection })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Tabs
        tabs={SYSTEM_TABS}
        value={section}
        onChange={selectSection}
        label="System sections"
        variant="segmented"
        className="w-full sm:w-auto"
      />
      {section === 'settings' && <SystemSettingsPage />}
      {section === 'alerts' && <AlertConfigPage />}
      {section === 'archival' && <ArchivalPolicyPage />}
      {section === 'health' && <HealthDashboardPage />}
    </div>
  )
}
