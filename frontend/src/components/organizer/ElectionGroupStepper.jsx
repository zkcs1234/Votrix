export default function ElectionGroupStepper({ sections, currentId, completedIds = [], onSelect }) {
  const currentIndex = sections.findIndex((section) => section.id === currentId)
  if (!sections.length) return null

  return (
    <section className="v-card space-y-3 p-4" aria-label="Election group setup">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="v-section-title">Election groups</h3>
        <p className="v-caption">
          Group {Math.max(currentIndex + 1, 1)} of {sections.length}
        </p>
      </div>
      <nav aria-label="Election group progress">
        <ol className="flex flex-wrap gap-2">
          {sections.map((section, index) => {
            const current = index === currentIndex
            const complete = !current && completedIds.includes(section.id)
            const canVisit = complete && index < currentIndex
            const status = current ? 'Current group' : complete ? 'Complete' : 'Not started'
            const className = `flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
              current
                ? 'border-v-primary bg-v-primary-soft/40 font-semibold text-v-primary'
                : complete
                  ? 'border-v-success/40 bg-v-success-bg text-v-text hover:border-v-success'
                  : 'border-v-border bg-v-surface text-v-text-muted'
            }`
            const content = (
              <>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{section.name}</span>
                  <span className="block text-[10px] font-normal opacity-75">{status}</span>
                </span>
              </>
            )

            return (
              <li key={section.id} aria-current={current ? 'step' : undefined}>
                {canVisit ? (
                  <button type="button" className={className} onClick={() => onSelect(section.id)}>
                    {content}
                  </button>
                ) : (
                  <span className={className}>{content}</span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>
    </section>
  )
}