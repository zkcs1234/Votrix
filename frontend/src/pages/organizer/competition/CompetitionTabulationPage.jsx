import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import CompetitionTabulationWorkspace from '@/components/organizer/competition/CompetitionTabulationWorkspace'
import { NativeTabulationBoundary } from '@/components/organizer/competition/NativeTabulationWorkspace'
import TabulationWorkspaceNavigation from '@/components/organizer/competition/TabulationWorkspaceNavigation'
import { TABULATION_SECTIONS, TABULATION_WORKSPACES, tabulationDestination } from '@/utils/tabulationNavigation'

export default function CompetitionTabulationPage({ workspace = null }) {
  const { eventId, section } = useParams()
  const location = useLocation()
  const activeWorkspace = workspace ?? 'tabulation'
  const group = TABULATION_WORKSPACES.find(item => item.id === workspace)
  const anchor = location.hash.replace('#tabulation-', '')
  const initialSection = group
    ? group.sections.find(item => item.id === anchor)?.id ?? group.sections[0].id
    : activeWorkspace === 'adjustments' ? 'deductions'
      : activeWorkspace === 'tabulation' ? TABULATION_SECTIONS.find(item => item.id === anchor)?.id ?? 'overview'
        : activeWorkspace ?? 'overview'

  useEffect(() => {
    if (!location.hash.startsWith('#tabulation-')) return
    const scroll = () => {
      const node = document.getElementById(location.hash.slice(1))
      if (!node) return false
      node.scrollIntoView?.({ block: 'start' })
      node.focus({ preventScroll: true })
      return true
    }
    if (scroll()) return
    const observer = new MutationObserver(() => { if (scroll()) observer.disconnect() })
    observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [location.hash, location.pathname])

  if (workspace === 'scoring') {
    return <Navigate replace to={tabulationDestination(eventId, 'scoring', location.search)} />
  }
  if (!workspace && section) {
    return <Navigate replace to={tabulationDestination(eventId, section, location.search)} />
  }
  return <div className="v-results-workspace min-w-0 space-y-4">
    {(workspace === 'results' || workspace === 'advancement') && (
      <TabulationWorkspaceNavigation eventId={eventId} section={initialSection} workspace={workspace} />
    )}
    <NativeTabulationBoundary eventId={eventId} initialSection={initialSection} workspace={activeWorkspace} Legacy={CompetitionTabulationWorkspace} />
  </div>
}
