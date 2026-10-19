import { useCallback, useEffect, useRef, useState } from 'react'
import { workflowService } from '@/services/competition-workflow.service'

export const scoreDraftKey = (judge, event, context) => `votrix.scoring.v1:${judge}:${event}:${context.sessionId}:${context.roundId ?? 'flat'}:${context.rulesVersion}`

export function recoverScoreDrafts(sheet, local = {}, previous = {}) {
  const scores = {}
  for (const draft of sheet.drafts ?? []) {
    for (const [id, value] of Object.entries(draft.scores)) scores[`${draft.contestant_id}:${id}`] = value
  }
  Object.assign(scores, previous, local)
  for (const entry of sheet.contestants ?? []) {
    for (const [id, value] of Object.entries(entry.existingScores ?? {})) {
      const parent = sheet.criteria?.find(c => c.id === id || c.minors?.some(m => m.id === id))
      const key = `${entry.id}:${id}`
      if (entry.hasSubmitted || entry.lockedCriteria?.includes(parent?.id) || scores[key] == null) scores[key] = value
    }
  }
  return scores
}

export default function useJudgeScoreDrafts(eventId, judgeId, sheet, scores, setScores) {
  const [status, setStatus] = useState({})
  const [recoveredKey, setRecoveredKey] = useState(null)
  const timers = useRef(new Map()), requests = useRef(new Map()), revisions = useRef(new Map())
  const edits = useRef(new Map()), latest = useRef({}), recovered = useRef(null)
  const contextKey = sheet?.context ? scoreDraftKey(judgeId, eventId, sheet.context) : null
  latest.current = { sheet, scores, contextKey }

  useEffect(() => {
    if (!contextKey) {
      if (sheet) setScores(recoverScoreDrafts(sheet))
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
      recovered.current = null
      setRecoveredKey(null)
      setStatus({})
      return
    }
    const changedContext = recovered.current !== contextKey
    let local = {}
    if (changedContext) {
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
      setStatus({})
      try { local = JSON.parse(localStorage.getItem(contextKey) ?? '{}') } catch { /* empty recovery */ }
    }
    for (const draft of sheet.drafts ?? []) {
      revisions.current.set(`${contextKey}:${draft.contestant_id}:${draft.criteria_id}`, draft.revision)
    }
    setScores(previous => recoverScoreDrafts(sheet, local, changedContext ? {} : previous))
    recovered.current = contextKey
    setRecoveredKey(contextKey)
  }, [sheet, contextKey, setScores])

  useEffect(() => {
    if (contextKey && recoveredKey === contextKey) {
      try { localStorage.setItem(contextKey, JSON.stringify(scores)) } catch { /* server drafts still persist */ }
    }
  }, [contextKey, recoveredKey, scores])

  useEffect(() => {
    const timerMap = timers.current
    return () => { for (const timer of timerMap.values()) clearTimeout(timer); timerMap.clear() }
  }, [])

  const save = useCallback(async (entryId, criterionId) => {
    const current = latest.current, { context, criteria } = current.sheet ?? {}
    if (!context) return
    const key = `${entryId}:${criterionId}`, storageKey = `${current.contextKey}:${key}`
    const criterion = criteria.find(c => c.id === criterionId)
    const entry = current.sheet.contestants.find(e => e.id === entryId)
    if (!criterion || entry?.hasSubmitted || entry?.lockedCriteria?.includes(criterionId)) return
    const targets = criterion.minors?.length ? criterion.minors : [criterion]
    const payload = {}
    for (const target of targets) {
      const value = current.scores[`${entryId}:${target.id}`]
      if (value !== '' && value != null && Number.isFinite(Number(value))) payload[target.id] = Number(value)
    }
    const editVersion = edits.current.get(storageKey) ?? 0
    setStatus(s => ({ ...s, [key]: 'Saving' }))
    const prior = requests.current.get(storageKey)
    if (prior) await prior.catch(() => {})
    if (latest.current.contextKey !== current.contextKey) return
    const request = workflowService.draft(eventId, { context, contestantId: entryId, criteriaId: criterionId, scores: payload, draftRevision: revisions.current.get(storageKey) ?? 0 })
    requests.current.set(storageKey, request)
    try {
      const { data } = await request
      revisions.current.set(storageKey, data.draft.revision)
      if (latest.current.contextKey === current.contextKey && (edits.current.get(storageKey) ?? 0) === editVersion) {
        setStatus(s => ({ ...s, [key]: 'Saved draft' }))
      }
    } catch (error) {
      if (latest.current.contextKey === current.contextKey) setStatus(s => ({ ...s, [key]: error.response?.data?.message ?? 'Unsaved - retry' }))
      throw error
    } finally {
      if (requests.current.get(storageKey) === request) requests.current.delete(storageKey)
    }
  }, [eventId])

  const changed = useCallback((entryId, targetId) => {
    const criterion = latest.current.sheet?.criteria?.find(c => c.id === targetId || c.minors?.some(m => m.id === targetId))
    if (!criterion) return
    const key = `${entryId}:${criterion.id}`, storageKey = `${latest.current.contextKey}:${key}`
    edits.current.set(storageKey, (edits.current.get(storageKey) ?? 0) + 1)
    setStatus(s => ({ ...s, [key]: 'Unsaved local edit' }))
    clearTimeout(timers.current.get(key))
    timers.current.set(key, setTimeout(() => save(entryId, criterion.id).catch(() => {}), 800))
  }, [save])
  const flush = useCallback(async (entry, criterion) => {
    clearTimeout(timers.current.get(`${entry}:${criterion}`))
    await save(entry, criterion)
  }, [save])
  return { status, changed, flush, hasPending: Object.values(status).some(s => s !== 'Saved draft') }
}
