import Button from './Button'

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className = '',
}) {
  return (
    <div className={`v-empty-state ${className}`}>
      {icon && <div className="text-v-text-subtle">{icon}</div>}
      <p className="v-empty-state-title">{title}</p>
      {description && (
        <p className="v-empty-state-description">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
