import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Download, Ban, Percent } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { voterService } from '@/services/voter.service'
import usePortalList from '@/hooks/usePortalList'
import { participantKind } from '@/utils/workspace'
import { downloadCsv } from '@/utils/csvDownload'
import { INPUT_CLASS } from '@/utils/uiClasses'
import {
  EVENT_TYPE_LABEL,
  OUTCOME_TONE,
  formatDate,
  formatDateTime,
  monthHeading,
} from '@/utils/participantFormat'
import PageHeader from '@/components/ui/PageHeader'
import StatCard from '@/components/ui/StatCard'
import Tabs from '@/components/ui/Tabs'
import SearchInput from '@/components/ui/SearchInput'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import { SkeletonList, SkeletonStatCard } from '@/components/ui/Skeleton'
import HistoryReceipt from '@/components/participant/HistoryReceipt'

const RANGES = [
  { value: 'last12', label: 'Last 12 months' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All time' },
]
const OUTCOMES = [
  { value: 'all', label: 'All' },
  { value: 'done', label: 'Took part' },
  { value: 'missed', label: 'Missed' },
]
const VIEWS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'table', label: 'Table' },
]
const STUDENT_TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'election', label: 'Elections' },
  { value: 'poll', label: 'Polls' },
]

const DEFAULTS = { type: 'all', outcome: 'all', range: 'last12', q: '', view: 'timeline' }
const pick = (value, allowed, fallback) => (allowed.some((a) => a.value === value) ? value : fallback)

function whenLabel(row) {
  if (row.completedAt) return formatDateTime(row.completedAt)
  return row.window?.end ? `Closed ${formatDate(row.window.end)}` : '—'
}

function Summary({ summary, judge }) {
  if (!summary) return null
  const tiles = judge ? (
    <>
      <StatCard label="Events judged" value={summary.eventsJudged} icon={CheckCircle2} />
      <StatCard label="Rounds submitted" value={summary.roundsSubmitted} />
      <StatCard label="Missed" value={summary.missed} hint="Round closed before you submitted" icon={Ban} />
      <StatCard label="Last submitted" value={summary.lastCompletedAt ? formatDate(summary.lastCompletedAt) : '—'} valueClassName="text-lg" />
    </>
  ) : (
    <>
      <StatCard
        label="Took part"
        value={`${summary.tookPart} of ${summary.total}`}
        hint={summary.participationRate == null ? undefined : `${summary.participationRate}% of closed events`}
        icon={Percent}
      />
      <StatCard label="Ballots" value={summary.ballots} hint={summary.partial ? `${summary.partial} partial` : undefined} />
      <StatCard label="Polls" value={summary.polls} />
      <StatCard label="Missed" value={summary.missed} hint="Enrolled, not submitted" icon={Ban} />
    </>
  )
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{tiles}</div>
}

function RowSummary({ row }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{EVENT_TYPE_LABEL[row.eventType] ?? row.eventType}</Badge>
        <span className="font-medium text-v-text">{row.title}</span>
      </div>
      <p className="v-caption mt-0.5">
        {[row.organizationName, row.summary].filter(Boolean).join(' · ')}
      </p>
    </>
  )
}

function TimelineRow({ row, open, onToggle }) {
  return (
    <li className="border-t border-v-border first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-v-surface-elevated focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v-primary"
      >
        <span className="min-w-0"><RowSummary row={row} /></span>
        <span className="shrink-0 text-right">
          <Badge tone={OUTCOME_TONE[row.outcome] ?? 'neutral'}>{row.outcome}</Badge>
          <span className="v-caption mt-1 block">{whenLabel(row)}</span>
        </span>
      </button>
      {open && <div className="px-4 pb-4"><HistoryReceipt row={row} /></div>}
    </li>
  )
}

function Timeline({ rows, openId, onToggle }) {
  const groups = useMemo(() => {
    const out = []
    for (const row of rows) {
      const heading = monthHeading(row.sortDate)
      const last = out[out.length - 1]
      if (last?.heading === heading) last.rows.push(row)
      else out.push({ heading, rows: [row] })
    }
    return out
  }, [rows])

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <h2 className="v-caption mb-2 font-medium">{group.heading} · {group.rows.length}</h2>
          <ul className="overflow-hidden rounded-2xl border border-v-border bg-v-surface">
            {group.rows.map((row) => (
              <TimelineRow key={row.id} row={row} open={openId === row.id} onToggle={() => onToggle(row.id)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HistoryTable({ rows, openId, onToggle }) {
  return (
    <div className="v-table-wrap">
      <table className="v-table min-w-160">
        <thead>
          <tr>
            <th>Event</th>
            <th>Role</th>
            <th>Outcome</th>
            <th>When</th>
            <th>Results</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <FragmentRow key={row.id} row={row} open={openId === row.id} onToggle={() => onToggle(row.id)} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FragmentRow({ row, open, onToggle }) {
  return (
    <>
      <tr className="cursor-pointer" onClick={onToggle}>
        <td>
          <button type="button" className="text-left" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle() }}>
            <RowSummary row={row} />
          </button>
        </td>
        <td>{row.role}</td>
        <td><Badge tone={OUTCOME_TONE[row.outcome] ?? 'neutral'}>{row.outcome}</Badge></td>
        <td>{whenLabel(row)}</td>
        <td>{row.results?.state === 'available' ? 'Available' : row.results?.state === 'pending' ? 'Not yet' : '—'}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}><HistoryReceipt row={row} /></td>
        </tr>
      )}
    </>
  )
}

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// What I have done: every enrolled event I took part in, partly completed or
// missed, newest first. Participation only, never choices or scores.
export default function ParticipantHistoryPage() {
  const { user } = useAuth()
  const kind = participantKind(user)
  const [searchParams, setSearchParams] = useSearchParams()

  const type = pick(searchParams.get('type'), STUDENT_TYPES, DEFAULTS.type)
  const outcome = pick(searchParams.get('outcome'), OUTCOMES, DEFAULTS.outcome)
  const range = pick(searchParams.get('range'), RANGES, DEFAULTS.range)
  const view = pick(searchParams.get('view'), VIEWS, DEFAULTS.view)
  const q = searchParams.get('q') ?? ''

  const [searchText, setSearchText] = useState(q)
  const debouncedSearch = useDebouncedValue(searchText.trim())
  const [openId, setOpenId] = useState(null)

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (!value || value === DEFAULTS[key]) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (debouncedSearch !== q) setParam('q', debouncedSearch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const list = usePortalList(voterService.getHistory, {
    type: type === 'all' ? undefined : type,
    outcome: outcome === 'all' ? undefined : outcome,
    range,
    search: q || undefined,
    limit: 20,
  })

  const summary = list.meta?.summary
  const judge = kind === 'judge' || (kind === 'participant' && (summary?.eventsJudged ?? 0) > 0)
  const filtering = type !== 'all' || outcome !== 'all' || Boolean(q)

  const exportCsv = () =>
    downloadCsv(
      'participation-history.csv',
      ['Event', 'Type', 'Organization', 'Role', 'Outcome', 'Summary', 'When'],
      list.items.map((row) => [
        row.title,
        EVENT_TYPE_LABEL[row.eventType] ?? row.eventType,
        row.organizationName ?? '',
        row.role,
        row.outcome,
        row.summary,
        whenLabel(row),
      ]),
    )

  const toggle = (id) => setOpenId((current) => (current === id ? null : id))

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="History"
        description="Your participation record. It shows that you took part, never what you chose or scored."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={list.items.length === 0}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </Button>
        }
      />

      {list.loading && !summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
        </div>
      ) : (
        <Summary summary={summary} judge={judge} />
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {kind !== 'judge' && <Tabs variant="segmented" label="Event type" value={type} onChange={(v) => setParam('type', v)} tabs={STUDENT_TYPES} />}
          <Tabs variant="segmented" label="Outcome" value={outcome} onChange={(v) => setParam('outcome', v)} tabs={OUTCOMES} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput placeholder="Search event or organization" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="sm:max-w-xs" />
          <select
            aria-label="Date range"
            className={`${INPUT_CLASS} sm:w-44`}
            value={range}
            onChange={(e) => setParam('range', e.target.value)}
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <Tabs variant="segmented" label="View" value={view} onChange={(v) => setParam('view', v)} tabs={VIEWS} className="sm:ml-auto" />
        </div>
      </div>

      {list.error ? (
        <div className="space-y-3">
          <FormAlert variant="error">{list.error}</FormAlert>
          <Button onClick={list.reload}>Retry</Button>
        </div>
      ) : list.loading ? (
        <SkeletonList count={4} />
      ) : list.items.length === 0 ? (
        <Card padding="sm" className="text-center">
          <p className="text-sm font-medium text-v-text">
            {filtering ? 'No matching history' : 'Nothing here yet'}
          </p>
          <p className="v-caption mt-1">
            {filtering
              ? 'Try another filter, or choose a longer date range.'
              : 'Take part in an event and it will show up here.'}
          </p>
        </Card>
      ) : (
        <>
          {view === 'table' ? (
            <HistoryTable rows={list.items} openId={openId} onToggle={toggle} />
          ) : (
            <Timeline rows={list.items} openId={openId} onToggle={toggle} />
          )}
          {list.hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={list.loadMore} loading={list.loadingMore}>Load more</Button>
            </div>
          )}
        </>
      )}

      <p className="v-caption">
        Archived events are not listed. Export covers the rows currently loaded.
      </p>
    </div>
  )
}
