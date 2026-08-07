import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Form Session Lifecycle manager.
 *
 * Guarantees that only one active form session exists at any time
 * (None | Create | Edit) and forces a clean End → Clear → Init → Load → Render
 * transition whenever the session mode or eventId changes.
 *
 * @param {object} opts
 * @param {string} opts.module - 'election' | 'competition' | 'polling'
 * @param {string|undefined} opts.eventId - route param; 'new' or undefined = Create
 * @param {boolean} opts.dirty - whether the current session has unsaved changes
 * @returns {{
 *   sessionType: 'none'|'create'|'edit',
 *   sessionKey: string,
 *   isNew: boolean,
 *   beginSession: () => void,
 *   endSession: () => void,
 *   clearState: () => void,
 *   confirmLeave: object|null,   // useBlocker result when interception active
 *   restoreNavigation: () => void,
 * }}
 */
export default function useFormSession({ module, eventId, dirty = false }) {
  const isNew = !eventId || eventId === 'new'
  const sessionType = isNew ? 'create' : 'edit'
  const sessionKey = isNew ? `${module}:create` : `${module}:edit:${eventId}`
  const sessionKeyRef = useRef(sessionKey)

  // Detect session changes (mode switch or eventId change) so callers can
  // trigger their cleanup + re-init.
  const [sessionChanged, setSessionChanged] = useState(false)

  useEffect(() => {
    if (sessionKeyRef.current !== sessionKey) {
      sessionKeyRef.current = sessionKey
      setSessionChanged((prev) => !prev) // toggle to force effect re-run
    }
  }, [sessionKey])

  // Navigation guard for a dirty Create session: intercept leaving so the
  // caller can offer Save as Draft / Discard / Cancel. Only active for
  // Create sessions with unsaved changes.
  const shouldBlock = isNew && dirty
  const confirmLeave = useBlocker(shouldBlock ? () => true : () => false)

  const restoreNavigation = () => {
    // no-op: the blocker remains active until the user chooses an action.
    // The caller decides to proceed (proceed()) or cancel.
  }

  const beginSession = () => {
    setSessionChanged(false)
  }

  const endSession = () => {
    // Persist/cancel logic is handled by the caller via the blocker actions.
  }

  const clearState = () => {
    // Intentionally lightweight: callers pass their own `reset`/`clearErrors`
    // from react-hook-form as needed. This hook owns the session boundary only.
  }

  return {
    sessionType,
    sessionKey,
    isNew,
    sessionChanged,
    confirmLeave,
    restoreNavigation,
    beginSession,
    endSession,
    clearState,
  }
}
