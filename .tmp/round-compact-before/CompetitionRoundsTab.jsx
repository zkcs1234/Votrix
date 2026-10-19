import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { pageantService } from '@/services/pageant.service'
import { workflowService } from '@/services/competition-workflow.service'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { roundSummary } from '@/utils/competitionRoundForm'
import CompetitionRoundForm from './CompetitionRoundForm'
import CompetitionRoundSettings from './CompetitionRoundSettings'

export default function CompetitionRoundsTab({ eventId, foundation, reload, readOnly, onConfigureCriteria, onConfigureDeductions }) {
  const nameRef = useRef(null)
  const createdCardRef = useRef(null)
  const [confirmedRounds, setConfirmedRounds] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const [createdId, setCreatedId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [section, setSection] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const savedRounds = useMemo(() => foundation.rounds ?? [], [foundation.rounds])
  const rounds = useMemo(() => {
    const merged = new Map(savedRounds.map(round => [round.id, round]))
    for (const round of confirmedRounds) merged.set(round.id, { ...merged.get(round.id), ...round })
    return [...merged.values()].filter(round => !deletedIds.includes(round.id)).sort((a, b) => Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0))
  }, [savedRounds, confirmedRounds, deletedIds])
  useEffect(() => {
    setConfirmedRounds(current => current.filter(round => !savedRounds.some(saved => saved.id === round.id)))
    setDeletedIds(current => current.filter(id => savedRounds.some(saved => saved.id === id)))
  }, [savedRounds])
  useEffect(() => {
    if (!createdId) return
    createdCardRef.current?.scrollIntoView?.({ block: 'nearest' })
    createdCardRef.current?.querySelector('button[data-next-action]')?.focus({ preventScroll: true })
  }, [createdId])
  const refresh = () => Promise.resolve(reload()).catch(() => setError('The change was saved, but the round list could not refresh. Refresh this page to reload the latest settings.'))
  const remember = round => setConfirmedRounds(current => [...current.filter(item => item.id !== round.id), round])
  const create = async payload => {
    setError(''); setNotice('')
    const { data } = await pageantService.createRound(eventId, payload)
    if (!data.round?.id) throw new Error('The server did not return the saved round. Refresh the page before trying again.')
    remember(data.round)
    setCreatedId(data.round.id)
    setNotice(`${data.round.name} created successfully.`)
    void refresh()
  }
  const update = async (round, payload) => {
    if (!Object.keys(payload).length) { setNotice('No changes to save.'); return }
    setBusyId(round.id); setError('')
    try {
      const { data } = await pageantService.updateRound(eventId, round.id, payload)
      if (!data.round?.id) throw new Error('The server did not return the updated round. Refresh the page to check the saved settings.')
      remember({ ...round, ...data.round })
      setNotice(`${data.round.name} updated successfully.`)
      void refresh()
    } finally { setBusyId(null) }
  }
  const remove = async round => {
    if (readOnly || busyId || !window.confirm(`Delete “${round.name}” and its round assignments? This cannot be undone.`)) return
    setBusyId(round.id); setError('')
    try {
      await pageantService.deleteRound(eventId, round.id)
      setDeletedIds(current => [...current, round.id])
      setConfirmedRounds(current => current.filter(item => item.id !== round.id))
      if (createdId === round.id) setCreatedId(null)
      if (expandedId === round.id) { setExpandedId(null); setSection(null) }
      setNotice(`${round.name} deleted.`)
      void refresh()
    } catch (failure) { setError(getErrorMessage(failure)) } finally { setBusyId(null) }
  }
  const move = async (round, delta) => {
    if (readOnly || busyId) return
    const ids = rounds.map(item => item.id), index = ids.indexOf(round.id), next = index + delta
    if (next < 0 || next >= ids.length) return
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    setBusyId(round.id); setError('')
    try { await workflowService.action(eventId, 'round-order', { roundIds: ids }); await refresh(); setNotice('Round order updated.') }
    catch (failure) { setError(getErrorMessage(failure)) } finally { setBusyId(null) }
  }
  return <div className="v-rounds max-w-3xl space-y-6">
    <header><h3 className="text-xl font-semibold text-v-text">Competition Rounds</h3>
      <p className="mt-1 text-sm leading-relaxed text-v-text-subtle">Create the judging rounds for your competition. You can create one or multiple rounds.</p>
    </header>
    {!readOnly && <CompetitionRoundForm rounds={rounds} categories={foundation.categories} divisions={foundation.divisions}
      divisionsEnabled={foundation.event?.divisions_enabled} onSave={create} nameInputRef={nameRef} />}
    <section className="space-y-3" aria-labelledby="competition-rounds-list">
      <h3 id="competition-rounds-list" className="text-lg font-semibold text-v-text">Your Rounds</h3>
      {notice && <p role="status" className="rounded-lg bg-v-success-bg px-4 py-3 text-sm text-v-success">{notice}</p>}
      {error && <p role="alert" className="v-error-text">{error}</p>}
      {!rounds.length && <p className="rounded-lg border border-dashed border-v-border p-5 text-sm text-v-text-subtle">No rounds yet. Create your first round above.</p>}
      <ol className="space-y-4">
        {rounds.map((round, index) => {
          const locked = readOnly || Boolean(round.finalizedAt)
          const division = (foundation.divisions ?? []).find(item => item.id === round.divisionId)
          const category = (foundation.categories ?? []).find(item => item.id === round.categoryId)
          return <li key={round.id} ref={round.id === createdId ? createdCardRef : null} className="v-card" data-round-id={round.id}>
            <article className="space-y-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-v-surface-elevated text-sm font-semibold text-v-text-muted">{index + 1}</span>
                <div className="min-w-0 flex-1"><h4 className="break-words text-base font-semibold text-v-text">{round.name}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-v-text-subtle">{roundSummary(round)}</p>
                  <p className="mt-1 text-xs text-v-text-subtle">{round.contestantIds?.length ?? 0} entries · {round.criteriaIds?.length ?? 0} criteria{division ? ` · ${division.name}` : ''}{category ? ` · ${category.name}` : ''}</p>
                </div>
                {round.id === createdId && <span className="text-xs font-medium text-v-success">Created</span>}
                {round.finalizedAt && <span className="text-xs font-medium text-v-text-subtle">Finalized</span>}
              </div>
              <p className="text-sm text-v-text-muted">Next, configure what judges will score in this round.</p>
              <Button className="min-h-11 w-full sm:w-auto" data-next-action onClick={() => onConfigureCriteria(round.id)}>Configure Scoring Criteria <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
              <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-v-border pt-3">
                <Button variant="ghost" className="min-h-11" disabled={locked || Boolean(busyId)} onClick={() => { setExpandedId(round.id); setSection('details') }}>Edit Round</Button>
                <Button variant="ghost" className="min-h-11" disabled={Boolean(busyId)} aria-expanded={expandedId === round.id} aria-controls={`round-settings-${round.id}`}
                  onClick={() => { setExpandedId(expandedId === round.id ? null : round.id); setSection(null) }}>More Settings</Button>
                <Button variant="ghost" className="min-h-11 text-v-danger" disabled={locked || Boolean(busyId)} onClick={() => remove(round)}>Delete</Button>
              </div>
            </article>
            {expandedId === round.id && <div id={`round-settings-${round.id}`}><CompetitionRoundSettings eventId={eventId} round={round} rounds={rounds} foundation={foundation}
              section={section} onSectionChange={setSection} onConfigureCriteria={() => onConfigureCriteria(round.id)} onConfigureDeductions={() => onConfigureDeductions(round.id)}
              onSave={payload => update(round, payload)} onMove={delta => move(round, delta)} readOnly={readOnly} busy={Boolean(busyId)} /></div>}
          </li>
        })}
      </ol>
      {!readOnly && rounds.length > 0 && <Button variant="secondary" className="min-h-11 w-full sm:w-auto" onClick={() => { nameRef.current?.scrollIntoView?.({ block: 'center' }); nameRef.current?.focus({ preventScroll: true }) }}>
        <Plus className="h-4 w-4" aria-hidden="true" />Create Another Round
      </Button>}
    </section>
  </div>
}
