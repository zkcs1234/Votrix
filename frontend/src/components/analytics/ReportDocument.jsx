/**
 * ReportDocument — shared layout for printable / exportable reports.
 *
 * Wraps a header, action bar, and a body that is module-specific. The
 * body is passed as children. This component is the single source of
 * truth for report page layout and is used by Election, Competition,
 * and Polling report pages.
 */
import ReportHeader from '@/components/reports/ReportHeader'

export default function ReportDocument({
  title,
  subtitle,
  generatedAt,
  actions,
  backTo = '/organizer/reports',
  maxWidthClass = 'max-w-4xl',
  children,
}) {
  return (
    <div className={`mx-auto ${maxWidthClass} space-y-8 print:space-y-6`}>
      <div className="flex flex-wrap items-start justify-between gap-4 print:flex-col">
        <ReportHeader
          title={title}
          subtitle={subtitle}
          generatedAt={generatedAt}
          backTo={backTo}
        />
        {actions}
      </div>
      {children}
    </div>
  )
}
