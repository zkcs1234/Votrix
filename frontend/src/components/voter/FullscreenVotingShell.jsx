import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * Portals a full-viewport voting/poll shell to <body>.
 *
 * Why this exists: the app's <main> carries the `v-page-enter` animation, whose
 * `translate` keyframe (with `both` fill, ending at `translate: 0 0`) leaves a
 * non-`none` transform on <main>. Any non-`none` transform makes that element
 * the containing block for `position: fixed` descendants, so a page using
 * `fixed inset-0` would pin to <main> — which sits below the sticky header and
 * has padding — instead of the viewport. Combined with `h-[100dvh]` the shell
 * then overflowed its slot and the fixed progress bar and submit footer could
 * not both stay on screen (most visible on mobile).
 *
 * Rendering the shell in a portal to <body> (which has no transform) restores
 * true viewport-relative `position: fixed`, so the pinned header/footer work on
 * every screen size. Background scroll is locked while the shell is mounted.
 */
export default function FullscreenVotingShell({ children }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return createPortal(children, document.body)
}
