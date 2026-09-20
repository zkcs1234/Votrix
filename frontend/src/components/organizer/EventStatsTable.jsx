import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import FilterBar from '@/components/ui/FilterBar'
import useTableFilter from '@/hooks/useTableFilter'

const STATUS_TONE = {
  active: 'success',
  scheduled: 'default',
  draft: 'default',
  completed: 'default',
  cancelled: 'danger',
}

/**
 * Per-event participation table. Every rate/cohort belongs to one event here —
 * no cross-event blending. Search by title and facet by status, both with the
 * shared filter primitive.
 *
 * @param {object} props
 * @param {Array}  props.events            [{ id, title, status, registered, participated, rate }]
 * @param {string} props.title
 * @param {(e) => string} [props.linkFor]  Row link builder.
 * @param {string} [props.registeredLabel]
 * @param {string} [props.participatedLabel]
 * @param {string} [props.rateLabel]
 * @param {string} [props.emptyMessage]
 */
export default function EventStatsTable({
  events = [],
  title = 'Events',
  linkFor,
  registeredLabel = 'Registered',
  participatedLabel = 'Participated',
  rateLabel = 'Rate',
  emptyMessage = 'No events yet.',
}) {
  const {
    search,
    setSearch,
    activeFilters,
    setFilter,
    clearFilters,
    filtered,
    facets,
    resultCount,
    totalCount,
    hasActiveFilters,
  } = useTableFilter({
    rows: events,
    searchKeys: ['title'],
    facetFields: [{ id: 'status', label: 'Status', accessor: 'status' }],
  })

  return (
    <Card padding={false}>
      <div className="border-b border-v-border px-6 py-4">
        <h3 className="font-semibold text-v-text">{title}</h3>
      </div>

      {events.length > 0 && (
        <div className="border-b border-v-border px-6 py-4">
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search events"
            facetFields={[{ id: 'status', label: 'Status' }]}
            facets={facets}
            activeFilters={activeFilters}
            onFilterChange={setFilter}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
            resultCount={resultCount}
            totalCount={totalCount}
            noun="events"
          />
        </div>
      )}

      <div className="v-table-wrap">
        <table className="v-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Status</th>
              <th className="text-right">{registeredLabel}</th>
              <th className="text-right">{participatedLabel}</th>
              <th className="text-right">{rateLabel}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center v-caption py-8">
                  {hasActiveFilters ? 'No events match your search' : emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id} className={linkFor ? 'hover:bg-v-surface-elevated' : ''}>
                  <td className="font-medium text-v-text">
                    {linkFor ? (
                      <Link to={linkFor(e)} className="hover:text-v-primary">
                        {e.title}
                      </Link>
                    ) : (
                      e.title
                    )}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[e.status] ?? 'default'}>{e.status}</Badge>
                  </td>
                  <td className="text-right tabular-nums text-v-text-muted">{e.registered}</td>
                  <td className="text-right tabular-nums text-v-text-muted">{e.participated}</td>
                  <td className="text-right tabular-nums font-medium text-v-text">{e.rate}%</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
