import { ArrowLeft, Building2 } from 'lucide-react'
import { Link } from 'react-router-dom'

const TYPE_GRADIENT = {
  election: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 50%, #0f766e 100%)',
  pageant: 'linear-gradient(135deg, #047857 0%, #0891b2 55%, #4338ca 100%)',
  competition_scoring: 'linear-gradient(135deg, #047857 0%, #0891b2 55%, #4338ca 100%)',
  polling: 'linear-gradient(135deg, #c2410c 0%, #be123c 55%, #4338ca 100%)',
}

function getInitials(name) {
  if (!name) return 'OR'
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'OR'
  return words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
}

export default function VoterEventHeader({ event, eyebrow, children }) {
  const hasBanner = Boolean(event?.banner?.trim?.())
  const organization = event?.organization
  const organizationName = organization?.name || organization?.organizationName
  const fallbackGradient = TYPE_GRADIENT[event?.eventType] ?? TYPE_GRADIENT.election

  return (
    <section className="overflow-hidden rounded-xl border border-v-border bg-v-surface">
      <div
        className="relative flex min-h-[180px] flex-col justify-between gap-8 px-5 py-5 sm:px-6"
        style={hasBanner ? undefined : { background: fallbackGradient }}
      >
        {hasBanner && (
          <img
            src={event.banner}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/35" />

        <div className="relative z-10">
          <Link
            to="/voter"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dashboard
          </Link>
        </div>

        <div className="relative z-10 space-y-3">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">{eyebrow}</p>
          )}
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">{event?.title}</h1>
            {event?.description && (
              <p className="max-w-2xl text-sm leading-6 text-white/80">{event.description}</p>
            )}
          </div>

          {organizationName && (
            <div className="flex items-center gap-2 text-sm text-white/80">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/25 bg-white/15 text-xs font-semibold text-white">
                {organization?.logo ? (
                  <img
                    src={organization.logo}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  getInitials(organizationName)
                )}
              </div>
              <span>Organized by {organizationName}</span>
            </div>
          )}

          {!organizationName && (
            <div className="flex items-center gap-2 text-sm text-white/70">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-white/15">
                <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </div>
              <span>Organization details unavailable</span>
            </div>
          )}

          {children}
        </div>
      </div>
    </section>
  )
}
