import { Link, useLocation } from 'react-router-dom'
import { tabulationWorkspace } from '@/utils/tabulationNavigation'
import './TabulationWorkspaceNavigation.css'

export default function TabulationWorkspaceNavigation({ eventId, section, workspace: workspaceId = null }) {
  const location = useLocation()
  const workspace = tabulationWorkspace(workspaceId ?? section)
  if (section === 'advancement') return <header className="v-results-workspace-nav">
    <div className="v-results-workspace-heading">
      <p className="v-results-workspace-eyebrow">Results &amp; Reporting</p>
      <h2>Round Advancement</h2>
      <p>Finalize current results, then review who can advance to the next round.</p>
    </div>
    <nav aria-label="Round advancement workflow">
      <Link to={{ pathname: `/organizer/competition/events/${eventId}/results`, search: location.search, hash: '#tabulation-finalization' }}>Review Finalization</Link>
      <span className="v-results-workspace-current">Round Advancement</span>
    </nav>
  </header>
  if (!workspace) return null

  return <header className="v-results-workspace-nav">
    <div className="v-results-workspace-heading">
      <p className="v-results-workspace-eyebrow">Results &amp; Reporting</p>
      <h2>{workspace.label}</h2>
      <p>{workspace.description}</p>
    </div>
    <nav aria-label={`${workspace.label} page sections`}>
      {workspace.sections.map(item => <Link
        key={item.id}
        to={{ pathname: `/organizer/competition/events/${eventId}/${workspace.id}`, search: location.search, hash: `#tabulation-${item.id}` }}
        aria-current={location.hash === `#tabulation-${item.id}` ? 'location' : undefined}
      >{item.label}</Link>)}
    </nav>
  </header>
}
