const variants = {
  primary:
    'bg-v-primary text-white hover:bg-v-primary-hover focus-visible:ring-v-text-muted disabled:opacity-50',
  secondary:
    'border border-v-border-strong bg-v-surface text-v-text hover:bg-v-surface-elevated',
  ghost: 'text-v-text-muted hover:bg-v-surface-elevated',
  danger:
    'bg-v-danger text-white hover:opacity-90 focus-visible:ring-v-danger disabled:opacity-50',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  loading = false,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-v-bg ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
