export default function LoadingSpinner({ className = '' }) {
  return (
    <div
      className={`inline-block h-8 w-8 animate-spin rounded-full border-2 border-v-text-muted border-t-transparent ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
