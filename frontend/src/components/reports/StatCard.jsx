export default function StatCard({ label, value, accent = 'text-white' }) {
  return (
    <div className="rounded-2xl border border-v-border bg-v-surface p-5">
      <p className="text-xs text-v-text-subtle">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accent}`}>{value ?? 0}</p>
    </div>
  )
}
