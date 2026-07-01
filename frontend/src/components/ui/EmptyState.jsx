import { Inbox, Users, BarChart3, FileText, Calendar } from 'lucide-react'
import Button from './Button'

const iconMap = {
  inbox: Inbox,
  users: Users,
  chart: BarChart3,
  document: FileText,
  calendar: Calendar,
  // Allow custom React node passed directly
  custom: null,
}

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className = '',
}) {
  // Handle different icon formats: string key, React element, or null
  let IconComponent = null
  if (icon) {
    if (typeof icon === 'string' && iconMap[icon]) {
      IconComponent = iconMap[icon]
    } else if (typeof icon === 'object' && icon?.type) {
      // It's a React element
      IconComponent = 'custom'
    }
  }

  return (
    <div className={`v-empty-state ${className}`}>
      {IconComponent && IconComponent !== 'custom' && (
        <div className="text-v-text-subtle">
          <IconComponent className="h-12 w-12" strokeWidth={1.5} />
        </div>
      )}
      {IconComponent === 'custom' && <div className="text-v-text-subtle">{icon}</div>}
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
