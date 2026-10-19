import { useEffect, useRef, useState } from 'react'
import { getDraftStorageKey } from '@/utils/draftStorage'

// Reuses the competition draft namespace, including existing logout cleanup.
// Local recovery never confirms rules or writes to the competition database.
export default function useScoringRulesRecovery({ actorId, eventId, locked, rules, baselineKey, dirty, stage, conflict, onRecover }) {
  const key = actorId && eventId ? getDraftStorageKey('competitionDraft', `${actorId}:${eventId}:scoring-rules-v1`) : null
  const processed = useRef(null)
  const [readyKey, setReadyKey] = useState(null)
  useEffect(() => {
    if (!key || processed.current === key) return
    processed.current = key
    if (!locked) {
      try {
        const cached = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (cached?.version === 1 && cached.rules && typeof cached.rules.calculationMethod === 'string' && Array.isArray(cached.rules.deductionRules ?? [])) {
          onRecover({ ...cached, rules: { ...cached.rules, confirmed: false }, conflict: cached.conflict || cached.baselineKey !== baselineKey })
        }
      } catch { /* Corrupt or unavailable local storage does not affect saved rules. */ }
    }
    setReadyKey(key)
  }, [key, locked, baselineKey, onRecover])
  useEffect(() => {
    if (!key || readyKey !== key) return
    try {
      if (locked || !dirty) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify({ version: 1, baselineKey, rules: { ...rules, confirmed: false }, stage: Math.min(stage, 2), conflict }))
    } catch { /* Explicit Save Draft still uses the existing backend API. */ }
  }, [key, readyKey, locked, rules, baselineKey, dirty, stage, conflict])
  useEffect(() => {
    if (!dirty || locked) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, locked])
}
