/**
 * Analytics registry — module boundary.
 *
 * Each module (election, competition, polling) registers its own fetcher
 * keyed by module id. The shared analytics layer reads from this registry
 * to load data. There is no cross-module data flow: each fetcher hits
 * only its own backend endpoints and returns its own domain object.
 *
 * A module's entry is:
 *   {
 *     id: 'election' | 'competition' | 'polling',
 *     label: 'Election' | 'Competition' | 'Polling',
 *     fetchAnalytics: (eventId) => Promise<analyticsObject>,
 *     fetchReport:    (eventId) => Promise<reportObject>,
 *   }
 *
 * The shape of analyticsObject/reportObject is module-specific and the
 * module's view layer is the only thing that interprets it. Shared
 * components are pure: they accept already-shaped data via props.
 */

const registry = new Map()

export function registerAnalyticsProvider(provider) {
  if (!provider?.id) {
    throw new Error('registerAnalyticsProvider: provider.id is required')
  }
  if (registry.has(provider.id)) {
    // Re-registration is allowed (HMR / tests) but only if the id matches.
    registry.set(provider.id, provider)
  } else {
    registry.set(provider.id, provider)
  }
  return provider
}

export function getAnalyticsProvider(id) {
  return registry.get(id)
}

export function listAnalyticsProviders() {
  return Array.from(registry.values())
}

export function unregisterAnalyticsProvider(id) {
  return registry.delete(id)
}
