// Figma "Button / Primary · Secondary · Ghost · Destructive" specimens.
// Radius 8px, 40px desktop height (44px on coarse pointers), visible focus ring.
const variants = {
  primary:
    'bg-v-primary text-white hover:bg-v-primary-hover active:brightness-95 focus-visible:ring-v-primary disabled:bg-v-surface-elevated disabled:text-v-text-subtle disabled:opacity-100 disabled:cursor-not-allowed',
  brand:
    'bg-v-primary text-white hover:bg-v-primary-hover focus-visible:ring-v-primary shadow-sm hover:shadow-md hover:-translate-y-px active:translate-y-0 disabled:bg-v-surface-elevated disabled:text-v-text-subtle disabled:opacity-100 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0',
  secondary:
    'border border-v-border-strong bg-v-surface text-v-text hover:bg-v-surface-elevated focus-visible:ring-v-primary disabled:text-v-text-subtle disabled:opacity-60 disabled:cursor-not-allowed',
  ghost:
    'text-v-text-muted hover:bg-v-surface-elevated hover:text-v-text focus-visible:ring-v-primary disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'bg-v-danger text-white hover:brightness-90 focus-visible:ring-v-danger disabled:bg-v-surface-elevated disabled:text-v-text-subtle disabled:opacity-100 disabled:cursor-not-allowed',
}

const sizes = {
  sm: 'min-h-8 px-3 py-1.5 text-sm pointer-coarse:min-h-11',
  md: 'min-h-10 px-4 py-2 text-sm pointer-coarse:min-h-11',
  lg: 'min-h-11 px-6 py-2.5 text-base',
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
      aria-busy={loading || undefined}
      className={`v-press inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-v-bg ${variants[variant] ?? variants.primary} ${sizes[size] ?? sizes.md} ${className}`}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  )
}
