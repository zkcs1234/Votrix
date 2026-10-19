import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { pageantService } from '@/services/pageant.service'
import { workflowService } from '@/services/competition-workflow.service'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { roundPurposeLabel, roundScoreSummary } from '@/utils/competitionRoundForm'
import CompetitionRoundForm from './CompetitionRoundForm'
import CompetitionRoundSettings from './CompetitionRoundSettings'
import CompetitionRoundActionsMenu from './CompetitionRoundActionsMenu'

export default function CompetitionRoundsTab({ eventId, foundation, reload, readOnly, onConfigureCriteria, onConfigureDeductions, onCountChange, initialRoundId, initialSection }) {
  const nameRef = useRef(null)
  const createdCardRef = useRef(null)
  const drawerTriggerRef = useRef(null)
  const [confirmedRounds, setConfirmedRounds] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const [createdId, setCreatedId] = useState(null)
  const [highlightId, setHighlightId] = useState(null)
  const [expandedId, setExpandedId] = useState(initialSection==='advancement' && foundation.rounds?.some(r=>r.id===initialRoundId) ? initialRoundId : null)
  const [section, setSection] = useState(initialSection==='advancement' ? 'advancement' : null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const savedRounds = useMemo(() => foundation.rounds ?? [], [foundation.rounds])
  const openedDeepLink=useRef(null)
  useEffect(()=>{
    const key=`${initialRoundId}:${initialSection}`
    if(initialSection==='advancement'&&savedRounds.some(r=>r.id===initialRoundId)&&openedDeepLink.current!==key){
      openedDeepLink.current=key;setExpandedId(initialRoundId);setSection('advancement')
    }
  },[initialRoundId,initialSection,savedRounds])
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
    setHighlightId(createdId)
    createdCardRef.current?.scrollIntoView?.({ block: 'nearest' })
    createdCardRef.current?.querySelector('button[data-next-action]')?.focus({ preventScroll: true })
    const timer = window.setTimeout(() => setHighlightId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [createdId])
  useEffect(() => { onCountChange?.(rounds.length) }, [rounds.length, onCountChange])
  const openSettings = (round, initialSection, trigger) => {
    drawerTriggerRef.current = trigger
    setExpandedId(round.id); setSection(initialSection)
  }
  const closeSettings = () => { if (!busyId) { setExpandedId(null); setSection(null) } }
  const selectedRound = rounds.find(round => round.id === expandedId)
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
  return <div className={`v-rounds grid min-w-0 items-start gap-5 xl:gap-6 ${readOnly ? '' : 'lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]'}`}>
    {!readOnly && <div data-round-form-column className="min-w-0"><CompetitionRoundForm rounds={rounds} categories={foundation.categories} divisions={foundation.divisions}
      divisionsEnabled={foundation.event?.divisions_enabled} onSave={create} nameInputRef={nameRef} /></div>}
    <section data-round-list-column className="min-w-0 space-y-3" aria-labelledby="competition-rounds-list">
      <h3 id="competition-rounds-list" className="text-base font-semibold text-v-text">Your Rounds</h3>
      {notice && <p role="status" className="text-sm leading-relaxed text-v-success"><span>{notice}</span>{createdId && notice.endsWith('created successfully.') ? ' Next, configure criteria.' : ''}</p>}
      {error && <p role="alert" className="v-error-text">{error}</p>}
      {!rounds.length && <p className="rounded-lg border border-dashed border-v-border p-5 text-sm text-v-text-subtle">No rounds yet. Create your first round using the form.</p>}
      <ol className="space-y-3">
        {rounds.map((round, index) => {
          const locked = readOnly || Boolean(round.finalizedAt)
          const division = (foundation.divisions ?? []).find(item => item.id === round.divisionId)
          const category = (foundation.categories ?? []).find(item => item.id === round.categoryId)
          return <li key={round.id} ref={round.id === createdId ? createdCardRef : null} className={`v-card transition-colors ${highlightId === round.id ? 'border-v-primary/40' : ''}`} data-round-id={round.id}>
            <article className="space-y-3 p-4">
              <div className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-v-surface-elevated text-sm font-medium text-v-text-muted">{index + 1}</span>
                <div className="min-w-0 flex-1"><h4 className="break-words text-base font-semibold text-v-text">{round.name}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-v-text-subtle">{roundScoreSummary(round)} · {round.criteriaIds?.length ?? 0} {round.criteriaIds?.length === 1 ? 'criterion' : 'criteria'}</p>
                  {(division || category || round.finalizedAt) && <p className="mt-1 break-words text-xs text-v-text-subtle">{[division?.name, category?.name, round.finalizedAt ? 'Finalized' : null].filter(Boolean).join(' · ')}</p>}
                </div>
                <span className="shrink-0 rounded-md bg-v-surface-elevated px-2 py-1 text-xs text-v-text-muted">{roundPurposeLabel(round)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="min-h-10" data-next-action aria-label={`Configure criteria for ${round.name}`} onClick={() => onConfigureCriteria(round.id)}>Criteria <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
                <Button variant="secondary" size="sm" className="min-h-10" disabled={Boolean(busyId)} aria-label={`Settings for ${round.name}`} aria-haspopup="dialog" aria-expanded={expandedId === round.id} aria-controls={expandedId === round.id ? `round-settings-${round.id}` : undefined}
                  onClick={event => openSettings(round, null, event.currentTarget)}>Settings</Button>
                <CompetitionRoundActionsMenu round={round} disabled={locked || Boolean(busyId)} canReorder={rounds.length > 1}
                  onEdit={trigger => openSettings(round, 'details', trigger)} onReorder={trigger => openSettings(round, 'order', trigger)} onDelete={() => remove(round)} />
              </div>
            </article>
          </li>
        })}
      </ol>
    </section>
    {selectedRound && <Modal open variant="drawer" id={`round-settings-${selectedRound.id}`} title={`${selectedRound.name} — Round Settings`}
      onClose={closeSettings} closeDisabled={Boolean(busyId)} closeOnBackdrop={!busyId} restoreFocusRef={drawerTriggerRef}
      footer={<div className="flex justify-end"><Button disabled={Boolean(busyId)} onClick={closeSettings}>Done</Button></div>}>
      <CompetitionRoundSettings eventId={eventId} round={selectedRound} rounds={rounds} foundation={foundation} section={section} onSectionChange={setSection}
        onConfigureCriteria={() => { closeSettings(); onConfigureCriteria(selectedRound.id) }} onConfigureDeductions={() => { closeSettings(); onConfigureDeductions(selectedRound.id) }}
        onSave={payload => update(selectedRound, payload)} onMove={delta => move(selectedRound, delta)} readOnly={readOnly} busy={Boolean(busyId)} />
    </Modal>}
  </div>
}
