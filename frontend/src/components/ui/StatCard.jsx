export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  className = '',
  valueClassName = '',
}) {
  return (
    <div className={`v-card-sm ${className}`}>
      <div className="flex items-center justify-between">
        <p className="v-caption">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-v-primary-soft text-v-primary">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${valueClassName || 'text-v-text'}`}>
        {value}
      </p>
      {hint && <p className="v-caption mt-0.5">{hint}</p>}
    </div>
  )
}