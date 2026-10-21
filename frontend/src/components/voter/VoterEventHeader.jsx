import VoterDashboardLink from '@/components/voter/VoterDashboardLink'

export default function VoterEventHeader({ event, eyebrow, children }) {
  return (
    <header className="space-y-4">
      <VoterDashboardLink />
      <div>
        {event?.title && <h1 className="text-3xl font-bold leading-tight text-v-text">{event.title}</h1>}
        {eyebrow && <p className="mt-1 text-sm text-v-text-muted">{eyebrow}</p>}
        {children && <div className="mt-2 space-y-1 text-sm text-v-text-muted">{children}</div>}
      </div>
    </header>
  )
}
