export default function StatCard({ label, value, hint, icon: Icon, className = '' }) {
  return (
    <div className={`v-card-sm ${className}`}>
      <div className="flex items-center justify-between">
        <p className="v-caption">{label}</p>
        {Icon && (
          <Icon className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} />
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-v-text">{value}</p>
      {hint && <p className="v-caption mt-1">{hint}</p>}
    </div>
  )
}