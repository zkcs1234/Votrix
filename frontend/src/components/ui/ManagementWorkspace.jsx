import { useState } from 'react'

/**
 * ManagementWorkspace
 *
 * Two-panel layout for management pages:
 * - Left: form/controls (fixed max-height, scrolls if form is very tall)
 * - Right: records list/grid (independently scrollable)
 * - Collapses to stacked on mobile (< lg breakpoint)
 */
export default function ManagementWorkspace({
  title,
  subtitle,
  formPanel,
  recordsPanel,
  headerActions,
  formWidthClass = 'lg:grid-cols-[minmax(320px,40%)_1fr]',
}) {
  const [formVisible, setFormVisible] = useState(true)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {title && <h2 className="font-display text-xl font-bold tracking-tight text-v-text sm:text-2xl">{title}</h2>}
          {subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-v-text-muted">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}
          <button
            type="button"
            className="v-btn-secondary lg:hidden"
            onClick={() => setFormVisible(!formVisible)}
          >
            {formVisible ? 'Hide Form' : 'Show Form'}
          </button>
        </div>
      </div>

      {/* Workspace Grid */}
      <div className={`v-workspace ${formWidthClass}`}>
        {/* Form Panel */}
        <div className={`v-workspace-form v-scroll-thin ${formVisible ? 'block' : 'hidden lg:block'}`}>
          {formPanel}
        </div>

        {/* Records Panel */}
        <div className="v-workspace-records v-scroll-thin">
          {recordsPanel}
        </div>
      </div>
    </div>
  )
}
