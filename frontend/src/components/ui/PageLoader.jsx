import VotrixLogo from '@/components/brand/VotrixLogo'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function PageLoader({ label = 'Loading…' }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-5"
      role="status"
      aria-live="polite"
    >
      <VotrixLogo size="lg" linkTo={null} />
      <LoadingSpinner className="h-8 w-8" />
      <p className="text-sm text-v-text-subtle">{label}</p>
    </div>
  )
}
