/**
 * AnalyticsLayout — shared scaffold for an analytics page.
 *
 * Pure presentational layout: title, optional subtitle, "view full report"
 * link, children. It does not know about election/competition/polling —
 * the module is determined by the page that renders it.
 */
import PageHeader from '@/components/ui/PageHeader'

export default function AnalyticsLayout({
  title,
  description,
  fullReportTo,
  fullReportLabel = 'Full report →',
  children,
}) {
  const actions = fullReportTo
    ? [
        <a
          key="full-report"
          href={fullReportTo}
          className="text-sm text-v-text-muted hover:text-v-text"
        >
          {fullReportLabel}
        </a>,
      ]
    : undefined

  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  )
}
