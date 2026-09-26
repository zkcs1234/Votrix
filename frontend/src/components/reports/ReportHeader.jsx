export default function ReportHeader({ title, subtitle, generatedAt }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-v-text">{title}</h2>
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
