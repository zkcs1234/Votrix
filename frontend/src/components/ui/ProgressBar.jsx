/**
 * Progress Bar Component
 * Use for file uploads, CSV imports, bulk operations, and long-running tasks
 */

export default function ProgressBar({
  value = 0,
  max = 100,
  showLabel = true,
  size = 'md',
  variant = 'primary',
  className = '',
  label,
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  const sizes = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  }

  const variants = {
    primary: 'bg-v-primary',
    success: 'bg-v-success',
    warning: 'bg-yellow-500',
    danger: 'bg-v-danger',
  }

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-v-text-muted">{label || 'Progress'}</span>
          <span className="text-v-text font-medium">{Math.round(percentage)}%</span>
        </div>
      )}
      <div
        className={`w-full overflow-hidden rounded-full bg-v-surface-elevated ${sizes[size]}`}
      >
        <div
          className={`h-full transition-all duration-300 ease-out ${variants[variant]}`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(percentage)}% complete`}
        />
      </div>
    </div>
  )
}

/**
 * Progress Bar with stats - use for CSV imports showing counts
 */
export function ProgressBarWithStats({
  value = 0,
  max = 100,
  succeeded = 0,
  failed = 0,
  className = '',
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={`space-y-2 ${className}`}>
      <ProgressBar value={value} max={max} />
      <div className="flex justify-between text-xs text-v-text-subtle">
        <span>
          {value} of {max} processed
        </span>
        <div className="flex gap-3">
          {succeeded > 0 && (
            <span className="text-v-success">{succeeded} succeeded</span>
          )}
          {failed > 0 && <span className="text-v-danger">{failed} failed</span>}
        </div>
      </div>
    </div>
  )
}

/**
 * Indeterminate progress bar - use when duration is unknown
 */
export function IndeterminateProgressBar({ className = '', label = 'Loading...' }) {
  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="mb-2 text-sm text-v-text-muted">{label}</div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-v-surface-elevated">
        <div
          className="h-full animate-pulse bg-v-primary"
          style={{ width: '100%' }}
          role="progressbar"
          aria-label={label}
        />
      </div>
    </div>
  )
}