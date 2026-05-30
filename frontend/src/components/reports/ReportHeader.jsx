import { Link } from 'react-router-dom'

export default function ReportHeader({ title, subtitle, generatedAt, backTo = '/organizer/reports' }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Link to={backTo} className="text-sm text-v-text-subtle hover:text-v-text-muted">
          â† All reports
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-v-text">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-v-text-subtle">{subtitle}</p>}
        {generatedAt && (
          <p className="mt-1 text-xs text-v-text-subtle">
            Generated {new Date(generatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
