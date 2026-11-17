/**
 * Foundation: per-request context.
 *
 * When a student officer works inside the organizer workspace they act AS the
 * owner organizer (req.user is swapped to the owner so every existing service
 * and ownership check works unchanged). The real person is kept here so that
 * code with no access to `req` — notably recordAudit — can still attribute the
 * action to them.
 *
 * Backed by AsyncLocalStorage, so the actor follows the request across awaits
 * without being passed through ~290 controller and service call sites.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

const storage = new AsyncLocalStorage()

/** Run `fn` with `actor` as the acting user for everything it (asynchronously) calls. */
export function runWithActor(actor, fn) {
  return storage.run({ actor }, fn)
}

/** The real acting user when delegated (an officer), otherwise null. */
export function getActor() {
  return storage.getStore()?.actor ?? null
}
