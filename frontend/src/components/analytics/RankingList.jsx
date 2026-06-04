/**
 * RankingList — ranked list of items, used for candidate rankings,
 * overall contestant rankings, judge activity, etc.
 *
 * Pure: takes items with { id, rank?, name, value, sublabel?, meta?, badge? }.
 * No module knowledge.
 */

export default function RankingList({
  items = [],
  emptyMessage = 'No rankings yet.',
  emptyDescription,
  className = '',
  valueFormatter,
  metaFormatter,
  showRank = true,
  variant = 'default', // 'default' | 'compact'
}) {
  if (!items.length) {
    return (
      <div className="v-empty-state">
        <p className="v-empty-state-title">{emptyMessage}</p>
        {emptyDescription && (
          <p className="v-empty-state-description">{emptyDescription}</p>
        )}
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <ul className={`divide-y divide-v-border rounded-xl border border-v-border ${className}`}>
        {items.map((item, idx) => (
          <li
            key={item.id ?? `${item.name}-${idx}`}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              {showRank && (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-v-surface-elevated text-xs font-semibold text-v-text-muted">
                  {item.rank ?? idx + 1}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm text-v-text">{item.name}</p>
                {item.sublabel && (
                  <p className="truncate text-xs text-v-text-subtle">{item.sublabel}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-v-text">
                {valueFormatter ? valueFormatter(item.value, item) : item.value ?? 0}
              </p>
              {item.meta && (
                <p className="text-xs text-v-text-subtle">
                  {metaFormatter ? metaFormatter(item.meta, item) : item.meta}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {items.map((item, idx) => (
        <article
          key={item.id ?? `${item.name}-${idx}`}
          className="flex items-center gap-4 rounded-xl border border-v-border bg-v-surface p-4"
        >
          {showRank && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-v-surface-elevated text-lg font-bold text-v-text-muted">
              {item.rank ?? idx + 1}
            </div>
          )}
          {item.photo && (
            <img
              src={item.photo}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-v-text">{item.name}</p>
              <p className="text-lg font-bold text-v-text-muted">
                {valueFormatter ? valueFormatter(item.value, item) : item.value ?? 0}
              </p>
            </div>
            {item.sublabel && (
              <p className="text-xs text-v-text-subtle">{item.sublabel}</p>
            )}
            {item.meta && (
              <p className="mt-1 text-xs text-v-text-subtle">
                {metaFormatter ? metaFormatter(item.meta, item) : item.meta}
              </p>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
