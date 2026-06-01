export default function StatCard({ label, value, hint, className = '' }) {
  return (
    <div className={`v-card-sm ${className}`}>
      <p className="v-caption">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-v-text">{value}</p>
      {hint && <p className="v-caption mt-1">{hint}</p>}
    </div>
  )
}