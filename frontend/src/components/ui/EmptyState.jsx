export default function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-2xl border border-dashed border-v-border px-6 py-12 text-center">
      <p className="font-medium text-v-text">{title}</p>
      {description && <p className="mt-2 text-sm text-v-text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
