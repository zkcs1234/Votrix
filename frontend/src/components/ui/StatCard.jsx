export default function StatCard({ label, value, hint, className = '' }) {
  return (
    <div className={`v-card p-6 ${className}`}>
      <p className="text-sm font-medium text-v-text-subtle">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-v-text">{value}</p>
      {hint && <p className="mt-1 text-xs text-v-text-subtle">{hint}</p>}
    </div>
  )
}
