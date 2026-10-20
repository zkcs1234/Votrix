import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

// Theme keys used by the `[data-module]` selectors in index.css.
const THEME_KEYS = {
  election: 'election',
  competition: 'competition-scoring',
  polling: 'polling',
}

/**
 * Figma "module card": icon + module name, one-line description and an
 * "Open workspace →" action in the module color. The whole card is one link, so
 * its accessible name is the title plus description.
 *
 * @param {object} props
 * @param {'election'|'competition'|'polling'} props.module
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} props.to
 * @param {string} [props.actionLabel]
 * @param {React.ComponentType} [props.icon]
 * @param {React.ReactNode} [props.meta]  Optional real figure shown under the description.
 */
export default function ModuleCard({
  module,
  title,
  description,
  to,
  actionLabel = 'Open workspace',
  icon: Icon,
  meta,
}) {
  return (
    <Link
      to={to}
      data-module={THEME_KEYS[module]}
      className="group v-card-sm flex flex-col gap-2 p-4 transition hover:border-v-primary/50 hover:shadow-v-shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          {Icon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-v-primary-soft text-v-primary">
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
          )}
          <span className="font-semibold text-v-primary">{title}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-v-primary opacity-70 transition group-hover:opacity-100" aria-hidden />
      </div>
      <p className="text-sm text-v-text-subtle">{description}</p>
      {meta && <p className="text-sm font-medium text-v-text">{meta}</p>}
      <span className="mt-1 text-sm font-semibold text-v-primary">{actionLabel} →</span>
    </Link>
  )
}
