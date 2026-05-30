const tones = {
  default: 'bg-v-surface-elevated text-v-text-muted border-v-border',
  success: 'bg-v-success-bg text-v-success border-transparent',
  danger: 'bg-v-danger-bg text-v-danger border-transparent',
  warning: 'bg-v-warning-bg text-v-warning border-transparent',
}

export default function Badge({ children, tone = 'default', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
