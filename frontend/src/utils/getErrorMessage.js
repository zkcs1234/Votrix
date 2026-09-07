/**
 * Central resolver that turns an axios/fetch error into a friendly,
 * user-facing message that states *what happened* and, where possible, *why*.
 *
 * Priority:
 *   1. The backend's own `message` (source of truth — e.g. "Invalid email or
 *      password", "Your account has been suspended"). Never overwrite this.
 *   2. A network/connectivity message when no response came back at all.
 *   3. The caller's context-specific fallback (e.g. "Failed to load session").
 *   4. A friendly message inferred from the HTTP status code.
 *   5. A generic last resort.
 *
 * @param {unknown} err - The caught error (typically an axios error).
 * @param {string} [fallback] - Context-specific fallback for this call site.
 * @returns {string}
 */
export function getErrorMessage(err, fallback) {
  // 1. Backend-provided reason wins.
  const backendMessage = err?.response?.data?.message
  if (typeof backendMessage === 'string' && backendMessage.trim()) {
    return backendMessage.trim()
  }

  // 2. No response at all → the request never reached the server.
  const noResponse = err && err.request && !err.response
  if (noResponse || err?.code === 'ERR_NETWORK') {
    return "Can't reach the server. Check your connection and try again."
  }

  // 3. Caller's intentional, context-specific fallback.
  if (fallback) return fallback

  // 4. Friendly message inferred from the status code.
  const status = err?.response?.status
  if (status) {
    if (status === 400 || status === 422) {
      return 'Please check the information you entered and try again.'
    }
    if (status === 401) return 'Your session has expired. Please sign in again.'
    if (status === 403) return "You don't have permission to do that."
    if (status === 404) return "We couldn't find what you were looking for."
    if (status === 409) {
      return 'That change conflicts with existing data. Please refresh and try again.'
    }
    if (status === 429) {
      return 'Too many attempts. Please wait a moment and try again.'
    }
    if (status >= 500) {
      return 'Something went wrong on our end. Please try again in a moment.'
    }
  }

  // 5. Last resort.
  return 'Something went wrong. Please try again.'
}

/**
 * Convenience shape for a titled error toast: a bold headline plus the
 * resolved reason underneath.
 *
 * @param {unknown} err
 * @param {{ title: string, fallback?: string }} options
 * @returns {{ title: string, message: string }}
 */
export function getErrorToast(err, { title, fallback } = {}) {
  return { title, message: getErrorMessage(err, fallback) }
}
