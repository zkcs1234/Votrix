import { createPortal } from 'react-dom'

/**
 * The pinned action bar for a participant task page (ballot, poll). It renders
 * into the layout's sticky `#stage-footer-portal` slot, the same one the
 * organizer setup pages use, so the page keeps its header and sidebar rail while
 * the Submit / Review buttons stay on screen. Without that slot (a test, or a
 * page rendered outside the layout) it renders in place.
 *
 * The slot is outside any <form> in the DOM, so a submit button placed here must
 * point at its form with the `form` attribute.
 */
export default function ParticipantTaskFooter({ children }) {
  const content = (
    <div className="border-t border-v-border bg-v-surface pb-[env(safe-area-inset-bottom)] shadow-v-shadow print:hidden">
      <div className="mx-auto max-w-2xl px-4 py-3 md:px-8">{children}</div>
    </div>
  )

  const target = typeof document === 'undefined' ? null : document.getElementById('stage-footer-portal')
  return target ? createPortal(content, target) : content
}
