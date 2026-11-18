import { useCallback, useMemo, useState } from 'react'
import { voterService } from '@/services/voter.service'
import usePortalList from '@/hooks/usePortalList'
import { useSocketEvent } from '@/hooks/useSocketEvent'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import { formatDate, formatDateTime } from '@/utils/participantFormat'
import PageHeader from '@/components/ui/PageHeader'
import Tabs from '@/components/ui/Tabs'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import PlacementBadge from '@/components/ui/PlacementBadge'
import { SkeletonList } from '@/components/ui/Skeleton'
import ElectionResultsCard from '@/components/voter/ElectionResultsCard'
import PollResultsCard from '@/components/voter/polling/PollResultsCard'

const STATE_BADGE = {
  final: { tone: 'success', label: 'Final' },
  live: { tone: 'info', label: 'Live' },
  pending: { tone: 'neutral', label: 'Not yet' },
  published: { tone: 'success', label: 'Published' },
}

function ItemHeader({ item, subtitle }) {
  const badge = STATE_BADGE[item.state] ?? STATE_BADGE.pending
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-v-text">{item.title}</h3>
        <p className="v-caption mt-0.5">{[item.organizationName, subtitle].filter(Boolean).join(' · ')}</p>
      </div>
      <Badge tone={badge.tone}>{badge.label}</Badge>
    </div>
  )
}

// The list only says that results exist. The body is fetched when the participant
// asks for it, one election at a time, from the endpoint that applies the
// per-position eligibility rules.
function ElectionItem({ item }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const toggle = useCallback(async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (results || loading) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await voterService.getElectionResults(item.eventId)
      setResults(data.results)
    } catch (err) {
      setError(err.response?.data?.message ?? 'These results could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [open, results, loading, item.eventId])

  if (item.state === 'pending') {
    return (
      <Card padding="sm">
        <ItemHeader item={item} subtitle={item.availableAfter ? `Results appear after voting closes on ${formatDate(item.availableAfter)}` : 'Results appear after voting closes'} />
      </Card>
    )
  }

  return (
    <Card padding="sm" className="space-y-3">
      <ItemHeader
        item={item}
        subtitle={
          item.state === 'live'
            ? 'Provisional until voting closes'
            : item.closedAt ? `Closed ${formatDate(item.closedAt)}` : null
        }
      />
      <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open}>
        {open ? 'Hide results' : 'View results'}
      </Button>
      {open && loading && <SkeletonList count={2} />}
      {open && error && (
        <FormAlert variant="error">
          {error}{' '}
          <button type="button" className="underline" onClick={() => { setOpen(false); setResults(null) }}>Try again</button>
        </FormAlert>
      )}
      {open && results && (
        <ElectionResultsCard results={results} electionTitle={item.title} resultsVisibility={item.resultsVisibility} />
      )}
    </Card>
  )
}

// Same on-demand pattern as elections: the list only says results exist, and the
// aggregate is fetched from the endpoint that applies the poll's visibility rule.
function PollItem({ item }) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const toggle = useCallback(async () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    if (results || loading) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await voterService.getPollResults(item.eventId)
      setResults(data.results)
    } catch (err) {
      setError(err.response?.data?.message ?? 'These results could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [open, results, loading, item.eventId])

  if (item.state === 'pending') {
    return (
      <Card padding="sm">
        <ItemHeader item={item} subtitle={item.availableAfter ? `Results appear after the poll closes on ${formatDate(item.availableAfter)}` : 'Results appear after the poll closes'} />
      </Card>
    )
  }

  return (
    <Card padding="sm" className="space-y-3">
      <ItemHeader
        item={item}
        subtitle={
          item.state === 'live'
            ? 'Provisional until the poll closes'
            : item.closedAt ? `Closed ${formatDate(item.closedAt)}` : null
        }
      />
      <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open}>
        {open ? 'Hide results' : 'View results'}
      </Button>
      {open && loading && <SkeletonList count={2} />}
      {open && error && (
        <FormAlert variant="error">
          {error}{' '}
          <button type="button" className="underline" onClick={() => { setOpen(false); setResults(null) }}>Try again</button>
        </FormAlert>
      )}
      {open && results && <PollResultsCard results={results} pollTitle={item.title} />}
    </Card>
  )
}

function CompetitionItem({ item }) {
  const names = [item.competitionName, item.roundName].filter(Boolean).join(' · ')
  return (
    <Card padding="sm" className="space-y-3">
      <ItemHeader item={item} subtitle={names || null} />
      <p className="v-caption">
        Official results published {formatDateTime(item.publishedAt)}
        {item.method ? ` · ${item.method}` : ''}
      </p>
      <div className="v-table-wrap">
        <table className="v-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Entry</th>
              <th>Contestant</th>
              <th>{item.standings.some((row) => row.manual) ? 'Result' : 'Final score'}</th>
            </tr>
          </thead>
          <tbody>
            {item.standings.map((row, index) => (
              <tr key={`${row.rank}-${row.name}-${index}`}>
                <td><PlacementBadge rank={row.rank} /></td>
                <td>{row.entryNumber ?? '—'}</td>
                <td>{row.name}</td>
                <td>{row.manual ? `Placement ${row.rank}` : row.score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="v-caption">Official snapshot only. Other judges&apos; scores are never shown.</p>
    </Card>
  )
}

// What the participant is allowed to see: election and poll results (per the
// organizer's visibility setting) and official published competition standings. Hidden or unpublished results are not listed.
export default function ParticipantResultsPage() {
  const list = usePortalList(voterService.getResults, { limit: 50 })
  useSocketEvent('election:voting-toggled', list.reload)
  useCompetitionSync(null, list.reload)

  const [kind, setKind] = useState('all')
  const kinds = useMemo(() => [...new Set(list.items.map((item) => item.kind))], [list.items])
  const shown = kind === 'all' ? list.items : list.items.filter((item) => item.kind === kind)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Results" description="Outcomes you are allowed to see, as the organizer has shared them." />

      {kinds.length > 1 && (
        <Tabs
          variant="segmented"
          label="Result type"
          value={kind}
          onChange={setKind}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'election', label: 'Elections' },
            { value: 'poll', label: 'Polls' },
            { value: 'competition', label: 'Competitions' },
          ]}
        />
      )}

      {list.error ? (
        <div className="space-y-3">
          <FormAlert variant="error">{list.error}</FormAlert>
          <Button onClick={list.reload}>Retry</Button>
        </div>
      ) : list.loading ? (
        <SkeletonList count={3} />
      ) : shown.length === 0 ? (
        <Card padding="sm" className="text-center">
          <p className="text-sm font-medium text-v-text">No results to show yet</p>
          <p className="v-caption mt-1">Results appear here once an organizer shares them with you.</p>
        </Card>
      ) : (
        <ul className="grid items-start gap-3 lg:grid-cols-2">
          {shown.map((item) => (
            <li key={item.id}>
              {item.kind === 'election' ? <ElectionItem item={item} />
                : item.kind === 'poll' ? <PollItem item={item} />
                  : <CompetitionItem item={item} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
