import { useEffect } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import CompetitionTabulationWorkspace from '@/components/organizer/competition/CompetitionTabulationWorkspace'
import { NativeTabulationBoundary } from '@/components/organizer/competition/NativeTabulationWorkspace'
import TabulationWorkspaceNavigation from '@/components/organizer/competition/TabulationWorkspaceNavigation'
import { TABULATION_WORKSPACES, tabulationWorkspace, tabulationDestination } from '@/utils/tabulationNavigation'

export default function CompetitionTabulationPage({ workspace = null }) {
  const { eventId, section = 'overview' } = useParams()
  const location = useLocation()
  const group = TABULATION_WORKSPACES.find(item => item.id === workspace)
  const anchor = location.hash.replace('#tabulation-', '')
  const initialSection = group
    ? group.sections.find(item => item.id === anchor)?.id ?? group.sections[0].id
    : workspace ?? section

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

  if (!workspace && (tabulationWorkspace(section) || ['advancement', 'audit'].includes(section))) {
    return <Navigate replace to={tabulationDestination(eventId, section, location.search)} />
  }
  return <div className="v-results-workspace min-w-0 space-y-4">
    <TabulationWorkspaceNavigation eventId={eventId} section={initialSection} workspace={workspace} />
    <NativeTabulationBoundary eventId={eventId} initialSection={initialSection} workspace={workspace} Legacy={CompetitionTabulationWorkspace} />
  </div>
}
