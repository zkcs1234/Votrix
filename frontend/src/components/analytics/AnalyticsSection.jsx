/**
 * AnalyticsSection — labelled card for a single analytics block.
 * Used to group a chart, table, or list with a title and meta line.
 */
import Card from '@/components/ui/Card'

export default function AnalyticsSection({
  title,
  description,
  meta,
  actions,
  children,
  className = '',
  padding = 'md',
}) {
  return (
    <Card padding={padding} className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium text-v-text">{title}</h3>
          {description && (
            <p className="mt-1 text-xs text-v-text-subtle">{description}</p>
          )}
          {meta && <p className="mt-1 text-xs text-v-text-subtle">{meta}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  )
}
