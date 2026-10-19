import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronDown } from 'lucide-react'
import { pageantService } from '@/services/pageant.service'
import { useAuthStore } from '@/store/auth.store'
import { getErrorMessage } from '@/utils/getErrorMessage'
import Button from '@/components/ui/Button'
import { INPUT_CLASS, LABEL_CLASS } from '@/utils/uiClasses'
import useScoringRulesRecovery from '@/hooks/useScoringRulesRecovery'
import ScoringMethodExample from './ScoringMethodExample'
import ScoringPenaltyRules from './ScoringPenaltyRules'
import { SCORING_METHODS, getScoringMethodOptions, eligibleReviewers, resultRoundPolicy, scoringRuleReadiness } from '../../../../../shared/competition-rule-configuration.js'

function initialRules(foundation) {
  const saved = foundation.scoringConfig ?? {}
  const raw = foundation.event?.scoring_config
  return { ...saved, calculationMethod: raw && !Object.hasOwn(raw, 'calculationMethod') ? 'undecided' : saved.calculationMethod ?? 'undecided',
    tiePolicy: saved.tiePolicy ?? 'shared', decimalPlaces: saved.decimalPlaces ?? 2, dropHighest: saved.dropHighest ?? 0, dropLowest: saved.dropLowest ?? 0,
    independentApproval: saved.independentApproval ?? true, deductionRules: saved.deductionRules ?? [], verifierId: saved.verifierId ?? null, finalRoundId: saved.finalRoundId ?? null, manualBasis: saved.manualBasis ?? '', confirmed: saved.confirmed ?? false }
}
function configurationKey(config) {
  const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value
  return JSON.stringify(sorted(config))
}
function Section({ title, description, actions, children }) {
  return <section aria-label={title} className="min-w-0 scroll-mt-24 rounded-xl border border-v-border bg-v-surface p-4 sm:p-5">
    <div className="mb-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 text-base font-semibold text-v-text">{title}</h3>{actions}</div>{description && <p className="mt-2 text-sm leading-relaxed text-v-text-muted">{description}</p>}</div>{children}
  </section>
}

export default function CompetitionRulesEditor({ foundation, reload, eventId, readOnly, initialSection = null, onStateChange }) {
  const actorId = useAuthStore(state => state.user?.id)
  const incoming = useMemo(() => initialRules(foundation), [foundation])
  const incomingKey = configurationKey(incoming)
  const [rules, setRules] = useState(incoming)
  const [stage, setStage] = useState(() => initialSection === 'deductions' && SCORING_METHODS.some(method => method.id === incoming.calculationMethod) ? 2 : 1)
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false)
  const [reviewKey, setReviewKey] = useState(null)
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [recovered, setRecovered] = useState(false)
  const editorRef = useRef(null), headingRef = useRef(null), focusField = useRef(null), previousStage = useRef(stage), lastSection = useRef(initialSection)
  const [baseline, setBaseline] = useState(incoming)
  const [saved, setSaved] = useState(Boolean(foundation.event?.scoring_config?.calculationMethod || foundation.scoringConfig?.confirmed !== undefined))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const [refreshRequired, setRefreshRequired] = useState(false), [conflict, setConflict] = useState(false), [changeSource, setChangeSource] = useState(false)
  const inFlight = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const baselineKey = configurationKey(baseline), dirty = configurationKey(rules) !== baselineKey
  const locked = readOnly || Boolean(foundation.event?.official_rules_id)
  useEffect(() => {
    if (inFlight.current || incomingKey === baselineKey) return
    if (dirty) setConflict(true)
    else { setRules(incoming); setBaseline(incoming); setSuccess(''); setSaved(true); setReviewAcknowledged(false); setReviewKey(null); setStage(1) }
  }, [incoming, incomingKey, baselineKey, dirty, busy])
  const readiness = useMemo(() => scoringRuleReadiness(foundation, rules, actorId), [foundation, rules, actorId])
  const reviewers = eligibleReviewers(foundation, actorId)
  const policy = resultRoundPolicy(foundation, rules)
  const selected = SCORING_METHODS.find(method => method.id === rules.calculationMethod)
  const decided = Boolean(selected), numeric = decided && rules.calculationMethod !== 'manual'
  const divisionsEnabled = foundation.event?.divisions_enabled ?? foundation.event?.divisionsEnabled ?? false
  const divisions = foundation.divisions ?? []
  const resultReview = rules.independentApproval !== false || rules.calculationMethod === 'manual'
  const hasPenalties = rules.deductionRules.length > 0
  const pendingReviewer = readiness.pending.some(issue => issue.field === 'verifierId')
  useEffect(() => {
    onStateChange?.({ dirty, saving: busy, saved, confirmed: !dirty && saved && baseline.confirmed === true, pendingReviewer, error: Boolean(error || conflict || refreshRequired), locked })
  }, [dirty, busy, saved, baseline.confirmed, pendingReviewer, error, conflict, refreshRequired, locked, onStateChange])
  const currentReviewKey = configurationKey({ ...rules, confirmed: false })
  const restoreLocal = useCallback(cached => {
    setRules(initialRules({ scoringConfig: cached.rules, event: { scoring_config: cached.rules } }))
    setStage(cached.stage === 2 && SCORING_METHODS.some(method => method.id === cached.rules.calculationMethod) ? 2 : 1)
    setConflict(Boolean(cached.conflict)); setRecovered(true); setReviewKey(null); setReviewAcknowledged(false)
  }, [])
  useScoringRulesRecovery({ actorId, eventId, locked, rules, baselineKey, dirty, stage, conflict, onRecover: restoreLocal })
  useEffect(() => {
    if (lastSection.current === initialSection) return
    lastSection.current = initialSection
    if (initialSection === 'deductions' && selected) setStage(2)
  }, [initialSection, selected])
  const focusSetting = useCallback(field => {
    const selectors = { calculationMethod: '#rules-method', decimalPlaces: '#rules-precision', tiePolicy: '#rules-ties', manualBasis: '#manual-result-basis', dropHighest: '#rules-dropHighest', dropLowest: '#rules-dropLowest', judgePanel: '#rules-dropHighest', finalRoundId: '#rules-result-round', deductionRules: '[id^="penalty-rule-"]', verifierId: '#rules-reviewer' }
    let input = editorRef.current?.querySelector(selectors[field] ?? '[data-change-method]')
    if (field === 'deductionRules') {
      for (let i = 0; i < rules.deductionRules.length; i++) {
        const rule = rules.deductionRules[i]
        const suffix = !String(rule.description ?? '').trim() ? 'description' : !Number.isFinite(Number(rule.amount)) || Number(rule.amount) <= 0 ? 'amount' : rule.units !== (rules.calculationMethod === 'rank_based' ? 'placements' : 'points') ? 'units' : null
        if (suffix) { input = editorRef.current?.querySelector(`#penalty-rule-${i}-${suffix}`); break }
      }
    }
    if (!input) input = editorRef.current?.querySelector('[data-change-method]') ?? headingRef.current
    let detail = input?.closest('details')
    while (detail) { detail.open = true; detail = detail.parentElement?.closest('details') }
    input?.focus(); input?.scrollIntoView?.({ block: 'center' })
  }, [rules.deductionRules, rules.calculationMethod])
  useEffect(() => {
    if (focusField.current && stage === 2) { focusSetting(focusField.current); focusField.current = null }
    else if (previousStage.current !== stage) { headingRef.current?.focus(); editorRef.current?.scrollIntoView?.({ block: 'start' }) }
    previousStage.current = stage
  }, [stage, validationAttempted, focusSetting])
  const fieldError = field => validationAttempted ? [...new Set(readiness.issues.filter(issue => issue.field === field).map(issue => issue.message))].join(' ') : ''
  const validationMessage = field => fieldError(field) ? <p id={`rules-error-${field}`} role="alert" className="v-error-text mt-1">{fieldError(field)}</p> : null
  const prepareReview = () => {
    if (locked) { setStage(3); return }
    if (!readiness.canConfirm) { setValidationAttempted(true); focusSetting(readiness.issues[0].field); return }
    setReviewAcknowledged(false); setReviewKey(currentReviewKey); setValidationAttempted(false); setError(''); setStage(3)
  }
  const update = (key, value) => {
    setRules(previous => ({ ...previous, [key]: value, confirmed: false, ...(key === 'calculationMethod' && ['rank_based', 'manual'].includes(value) ? { tiePolicy: 'shared', ...(value === 'manual' ? { independentApproval: true } : {}) } : {}) }))
    setSuccess(''); setError(''); setReviewAcknowledged(false); setReviewKey(null)
  }
  const useLatest = () => { setRules(incoming); setBaseline(incoming); setSaved(true); setConflict(false); setError(''); setSuccess(''); setReviewAcknowledged(false); setReviewKey(null); setStage(1); setRecovered(false) }
  const save = async confirmed => {
    if (locked || inFlight.current || conflict || refreshRequired) return
    if (confirmed && (stage !== 3 || !reviewAcknowledged || reviewKey !== currentReviewKey || !readiness.canConfirm)) return
    const invalidNumbers = readiness.issues.filter(issue => ['decimalPlaces', 'dropHighest', 'dropLowest'].includes(issue.field))
    if (invalidNumbers.length) { setError(invalidNumbers.map(issue => issue.message).join(' ')); focusField.current = invalidNumbers[0].field; setValidationAttempted(true); setStage(2); return }
    inFlight.current = true; setBusy(true); setError(''); setSuccess('')
    const payload = { ...rules, confirmed: confirmed && rules.calculationMethod !== 'undecided' }
    try {
      const { data } = await pageantService.setScoringConfig(eventId, payload)
      if (!mounted.current) return
      if (!data.config || data.success === false) throw new Error('The server did not confirm the saved rules. Reload before continuing.')
      const savedRules = initialRules({ ...foundation, event: { ...foundation.event, scoring_config: data.config }, scoringConfig: data.config })
      setRules(savedRules); setBaseline(savedRules); setSaved(true)
      try {
        const latest = await reload()
        if (!mounted.current) return
        if (latest?.scoringConfig && configurationKey(initialRules(latest)) !== configurationKey(savedRules)) {
          const latestRules = initialRules(latest)
          setRules(latestRules); setBaseline(latestRules); setError('Saved settings changed again. Review the current saved configuration before continuing.')
        } else { setSuccess(payload.confirmed ? 'Scoring configuration confirmed and saved. Publish the event later in Review & Publish.' : 'Draft saved. Complete and confirm the official rules before publishing.'); setRecovered(false) }
      } catch (refreshError) { setRefreshRequired(true); setError(`Your settings were saved, but could not be refreshed. ${getErrorMessage(refreshError)}`) }
    } catch (saveError) { if (mounted.current) setError(getErrorMessage(saveError)) }
    finally { inFlight.current = false; if (mounted.current) setBusy(false) }
  }
  const refreshSaved = async () => {
    setBusy(true); inFlight.current = true
    try { const latest = await reload(); const current = initialRules(latest ?? foundation); setRules(current); setBaseline(current); setSaved(true); setRefreshRequired(false); setError('') }
    catch (refreshError) { setError(getErrorMessage(refreshError)) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const tieSummary = rules.calculationMethod === 'manual' ? 'Placements follow the documented manual procedure' : rules.tiePolicy === 'highest_criterion' ? 'Compare the highest major average; remaining ties share a rank' : 'Share the same rank'
  const summary = [
    ['Method', selected?.name ?? (rules.calculationMethod === 'undecided' ? 'Not yet decided — draft' : `Saved method: ${rules.calculationMethod}`)],
    ['Winner result', rules.calculationMethod === 'manual' ? 'Documented manual placements for the selected scope' : policy.name], ['Ties', tieSummary],
    ['Divisions', rules.perDivision ? `${divisions.map(d => d.name).join(', ') || 'Saved divisions'}: separate rankings${!divisionsEnabled ? ' (divisions are currently disabled)' : ''}` : 'One combined ranking'],
    ['Result review', resultReview ? 'A different authorized person reviews the result' : 'Organizer review; a verification step still precedes finalization'],
    ...(readiness.reviewerRequired ? [['Reviewer', readiness.reviewer?.displayName ?? readiness.reviewer?.email ?? 'Assign reviewer later — required before publication']] : []),
    ['Penalties', hasPenalties ? `${rules.deductionRules.length} configured ${rules.deductionRules.length === 1 ? 'rule' : 'rules'}; separate approval required` : 'Off — no rules configured'],
    ...(numeric ? [['Precision', `${rules.decimalPlaces} decimal places; judge totals are rounded before aggregation`]] : []),
  ]
  return <form aria-label="Official scoring rules" onSubmit={event => { event.preventDefault(); void save(true) }} ref={editorRef} className="v-rounds mx-auto max-w-3xl scroll-mt-24 space-y-4">
    {locked && <p className="rounded-lg border border-v-border bg-v-surface-elevated p-3 text-sm text-v-text-muted">These saved scoring rules are read-only. Published rule changes use the authorized amendment procedure.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 ref={headingRef} tabIndex={-1} className="text-xs font-semibold uppercase tracking-wide text-v-primary focus:outline-none">Step {stage} of 3 — {['Choose', 'Configure', 'Review'][stage - 1]}</h3>
      <span className="text-xs text-v-text-muted">{locked ? 'Published / read-only' : dirty ? 'Unsaved changes' : !saved ? 'Not saved' : baseline.confirmed ? 'Confirmed configuration saved' : 'Draft saved'}</span>
    </div>
    <fieldset disabled={busy || refreshRequired} className="min-w-0">
      {stage === 1 && <Section title="How should results be calculated?" description="Choose the approach stated in your competition rules, then explore its example.">
        <label htmlFor="rules-method" className="sr-only">Calculation method</label>
        <select id="rules-method" disabled={locked} className={`${INPUT_CLASS} w-full`} value={selected ? rules.calculationMethod : rules.calculationMethod === 'undecided' ? '' : rules.calculationMethod} onChange={event => update('calculationMethod', event.target.value)}>
          <option value="" disabled>Select a calculation method</option>
          {!selected && rules.calculationMethod !== 'undecided' && <option value={rules.calculationMethod} disabled>Saved method: {rules.calculationMethod} — choose a supported method</option>}
          {getScoringMethodOptions(rules.calculationMethod).map(method => <option key={method.id} value={method.id}>{method.name}</option>)}
        </select>
        {selected && <p className="mt-2 text-sm text-v-text-muted">{selected.description}</p>}
        {!locked && <button type="button" className="mt-2 min-h-9 text-xs text-v-text-muted underline underline-offset-2 hover:text-v-primary" onClick={() => update('calculationMethod', 'undecided')}>Not yet decided — Save Draft</button>}
        <div role="region" aria-label="See how it works" className="mt-4 space-y-3 border-t border-v-border pt-4">
          <h4 className="text-sm font-semibold text-v-text">See how it works</h4>
          <p className="text-xs text-v-text-subtle">Fictional educational example. These values are never saved to your competition.</p>
          <ScoringMethodExample config={rules} readiness={readiness} illustrative />
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-v-border pt-4 sm:flex-row sm:justify-between">
          {!locked && <Button variant="secondary" onClick={() => { void save(false) }} disabled={conflict}>Save Draft</Button>}
          <Button disabled={!decided || busy || refreshRequired} onClick={() => { setStage(2); setValidationAttempted(false) }}>Continue to Settings<ArrowRight className="h-4 w-4" aria-hidden /></Button>
        </div>
      </Section>}
      {stage === 2 && <Section title={`Configure ${selected?.name ?? 'the selected method'}`} description="Set only the rules needed for this method." actions={<Button size="sm" variant="ghost" data-change-method onClick={() => { setStage(1); setReviewAcknowledged(false) }}>Change Method</Button>}>
        {!decided ? <p className="text-sm text-v-text-muted">Official publication and judging remain unavailable until a supported method is selected and the required setup is complete.</p> : <fieldset disabled={locked} className="min-w-0 space-y-5">
          {rules.calculationMethod === 'manual' ? <div><label htmlFor="manual-result-basis" className={LABEL_CLASS}>Official result source and approval procedure</label><textarea id="manual-result-basis" aria-invalid={Boolean(fieldError("manualBasis"))} aria-describedby={fieldError("manualBasis") ? "rules-error-manualBasis" : undefined} className={`${INPUT_CLASS} min-h-24 w-full`} placeholder="Describe the approved placement record, who prepares it, and how ties are resolved." value={rules.manualBasis} onChange={e => update('manualBasis', e.target.value)} />{validationMessage("manualBasis")}<p className="mt-1 text-xs text-v-text-muted">Manual placements require a complete eligible contestant list, positive placement numbers, and independent approval. Enter the placements later in Tabulation.</p></div> : <div className="space-y-2">
            <h4 className="text-sm font-medium text-v-text">Which round determines the winners?</h4>
            <p className="text-sm leading-relaxed text-v-text-muted">{policy.description}</p>
            {foundation.rounds?.length > 1 && ((['independent', 'carry_forward'].includes(policy.mode) && policy.mainRounds.length > 1) || policy.missing || changeSource || !policy.final && !policy.mainRounds.some(r => (r.progression ?? 'weighted') === 'weighted')) ? <select id="rules-result-round" aria-invalid={Boolean(fieldError("finalRoundId"))} aria-describedby={fieldError("finalRoundId") ? "rules-error-finalRoundId" : undefined} aria-label="Which round determines the winners?" className={`${INPUT_CLASS} w-full sm:max-w-lg`} value={rules.finalRoundId ?? (['independent', 'carry_forward'].includes(policy.mode) ? policy.final?.id : '') ?? ''} onChange={e => update('finalRoundId', e.target.value || null)}>
              <option value="">Use the configured round setup</option>{policy.missing && <option value={rules.finalRoundId}>Saved result round — currently unavailable</option>}{policy.final?.purpose === 'special' && <option value={policy.final.id}>{policy.final.name} — saved independent award source</option>}{policy.mainRounds.map(round => <option key={round.id} value={round.id}>{round.name}</option>)}
            </select> : foundation.rounds?.length > 1 && policy.mainRounds.length > 1 && <button type="button" className="min-h-9 text-xs text-v-primary underline underline-offset-2" onClick={() => setChangeSource(true)}>Choose a different result source</button>}
            {validationMessage('finalRoundId')}
            {policy.mode === 'weighted' && <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-v-text-subtle">{policy.mainRounds.map(round => <li key={round.id}>{round.name}: {round.progression === 'carry_forward' ? 'adds earlier results' : `${round.weight ?? 0}% contribution`}</li>)}</ul>}
            {(foundation.rounds ?? []).some(round => round.purpose === 'special') && <p className="text-xs text-v-text-subtle">Independent awards: {foundation.rounds.filter(round => round.purpose === 'special').map(round => round.name).join(', ')}. Their standings are separate from the ordinary combined result.</p>}
          </div>}
          {rules.calculationMethod === 'lowest_removal' && <div className="space-y-2"><p className="text-sm text-v-text-muted">Remove whole judge totals before averaging. Keep at least one total in every assigned panel.</p><div className="grid gap-3 sm:grid-cols-2">{[['dropHighest', 'Highest judge totals to remove'], ['dropLowest', 'Lowest judge totals to remove']].map(([key, label]) => <div key={key}><label htmlFor={`rules-${key}`} className={LABEL_CLASS}>{label}</label><input id={`rules-${key}`} type="number" min="0" step="1" className={`${INPUT_CLASS} w-full`} value={rules[key]} aria-invalid={Boolean(fieldError(key))} aria-describedby={fieldError(key) ? `rules-error-${key}` : undefined} onChange={e => update(key, e.target.value === '' ? '' : Number(e.target.value))} />{validationMessage(key)}</div>)}</div>{validationMessage('judgePanel')}<p className="text-xs text-v-text-subtle">{readiness.panels.total ? `${readiness.panels.total} active scoring judges available. Smallest current panel: ${readiness.panels.minimum}.` : 'Add scoring judges later in the Judges step. Panel counts are checked again before publication.'} Zero removal counts average all totals.</p></div>}
          {numeric && <div className="space-y-2"><label htmlFor="rules-ties" className={LABEL_CLASS}>What happens if contestants tie?</label>{rules.calculationMethod === 'rank_based' ? <p className="text-sm text-v-text-muted">Tied judge totals share placements; equal combined rank sums share the final rank. The next rank skips the tied positions, such as 1, 1, 3.</p> : <><select id="rules-ties" aria-invalid={Boolean(fieldError("tiePolicy"))} aria-describedby={fieldError("tiePolicy") ? "rules-error-tiePolicy" : undefined} className={`${INPUT_CLASS} w-full sm:max-w-lg`} value={rules.tiePolicy} onChange={e => update('tiePolicy', e.target.value)}><option value="shared">Share the same rank</option><option value="highest_criterion">Compare the highest major average</option></select><p className="text-xs text-v-text-muted">{rules.tiePolicy === 'highest_criterion' ? 'Equal official scores are compared using each contestant’s highest normalized major average across judges. Remaining ties share a rank.' : 'Tied contestants receive the same placement, such as 1, 2, 2, 4.'}</p></>}
            {validationMessage("tiePolicy")}
            {(foundation.rounds ?? []).some(round => ['top_n', 'top_percent'].includes(round.advancementType)) && <p className="text-xs leading-relaxed text-v-text-subtle">At a qualifying cutoff, everyone still tied advances. This can exceed the planned number. Advancement selections are reviewed separately in Tabulation; these rules do not promise an exact qualifier count.</p>}
          </div>}
          {divisionsEnabled && <div className="space-y-2"><label className="flex items-start gap-2 text-sm text-v-text"><input type="checkbox" className="mt-1 accent-v-primary" checked={!!rules.perDivision} onChange={e => update('perDivision', e.target.checked)} />Calculate winners separately for each division</label><p className="text-xs text-v-text-muted">Each division receives its own rankings, according to the competition rules.{divisions.length ? ` Divisions: ${divisions.map(d => d.name).join(', ')}.` : ' Add division names in the Divisions step.'}</p><p className="text-xs text-v-text-subtle">{rules.calculationMethod === 'manual' ? 'Manual placement numbers are entered explicitly; this setting does not renumber them automatically.' : 'This setting also applies qualifying cutoffs separately within each division in the current workflow.'}</p></div>}
          {numeric && <details className="rounded-lg border border-v-border p-3"><summary className="flex cursor-pointer items-center justify-between gap-2 text-sm font-medium text-v-text">Advanced: score precision <span className="text-xs font-normal text-v-text-muted">{rules.decimalPlaces} decimal places<ChevronDown className="ml-1 inline h-3.5 w-3.5" aria-hidden /></span></summary><div className="mt-3"><label htmlFor="rules-precision" className={LABEL_CLASS}>Decimal places for calculated scores</label><input id="rules-precision" aria-invalid={Boolean(fieldError("decimalPlaces"))} aria-describedby={fieldError("decimalPlaces") ? "rules-error-decimalPlaces" : undefined} type="number" min="0" max="6" step="1" className={`${INPUT_CLASS} w-full sm:max-w-40`} value={rules.decimalPlaces} onChange={e => update('decimalPlaces', e.target.value === '' ? '' : Number(e.target.value))} />{validationMessage('decimalPlaces')}<p className="mt-2 text-xs leading-relaxed text-v-text-muted">Judge totals are rounded before they are combined. {rules.calculationMethod === 'rank_based' ? 'This precision also determines when a judge’s source totals tie.' : 'Calculated results use the saved rounding precision.'} Positive halfway values round upward.</p></div></details>}
          <div className="space-y-3 border-t border-v-border pt-4"><label className="flex items-start gap-2 text-sm text-v-text"><input type="checkbox" className="mt-1 accent-v-primary" checked={resultReview} disabled={rules.calculationMethod === 'manual'} onChange={e => update('independentApproval', e.target.checked)} />Require a second person to review results</label><p className="text-xs text-v-text-muted">A different authorized reviewer checks the tabulation before results become official.{rules.calculationMethod === 'manual' ? ' This is required for manual results.' : ''}</p>
            {(resultReview || hasPenalties) && <div><label htmlFor="rules-reviewer" className={LABEL_CLASS}>{resultReview ? 'Who will review the results?' : 'Who will approve penalties?'}</label><select id="rules-reviewer" className={`${INPUT_CLASS} w-full sm:max-w-lg`} value={rules.verifierId ?? ''} onChange={e => update('verifierId', e.target.value || null)}><option value="">Assign reviewer later in Judges</option>{rules.verifierId && !reviewers.some(j => j.judgeId === rules.verifierId) && <option value={rules.verifierId}>Saved reviewer — currently unavailable</option>}{reviewers.map(judge => <option key={judge.id} value={judge.judgeId}>{judge.displayName ?? judge.email}</option>)}</select><p className="mt-1 text-xs text-v-text-muted">{readiness.reviewer ? 'Only active enrolled score reviewers are listed. The reviewer must be a different person from the organizer who prepares the calculation.' : 'Reviewer assignment is pending. Save your work now, then enroll and appoint a reviewer in Judges before Review & Publish.'}</p><Link className="inline-flex min-h-9 items-center text-xs text-v-primary underline underline-offset-2" to={`/organizer/competition/events/${eventId}/judges`}>Manage judges and reviewers</Link></div>}
          </div>
          <ScoringPenaltyRules config={rules} foundation={foundation} update={update} readOnly={locked || busy} initialSection={initialSection} />{validationMessage('deductionRules')}
        </fieldset>}
        <div className="mt-5 flex flex-col gap-3 border-t border-v-border pt-4 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={() => setStage(1)}><ArrowLeft className="h-4 w-4" aria-hidden />Back</Button>
          <Button onClick={prepareReview} disabled={busy || conflict || refreshRequired}>{locked ? 'Review saved configuration' : 'Save & Review'}<ArrowRight className="h-4 w-4" aria-hidden /></Button>
        </div>
        {!locked && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-v-text-muted">Review prepares these settings. Final confirmation saves them.</p><Button size="sm" variant="ghost" onClick={() => { void save(false) }} disabled={conflict}>Save Draft</Button></div>}
      </Section>}
      {stage === 3 && <Section title="Review your scoring rules" description="Check this summary against the official competition guidelines.">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{summary.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-v-text-subtle">{label}</dt><dd className="mt-1 break-words text-sm text-v-text">{value}</dd></div>)}</dl>
        {!locked && <>
          {!readiness.canConfirm && <p role="alert" className="mt-4 text-sm text-v-danger">Some settings need attention. Edit Settings to review them before confirming.</p>}
          <label className="mt-4 flex items-start gap-2 border-t border-v-border pt-4 text-sm text-v-text"><input type="checkbox" className="mt-1 accent-v-primary" checked={reviewAcknowledged} disabled={!readiness.canConfirm || reviewKey !== currentReviewKey} onChange={event => setReviewAcknowledged(event.target.checked)} />I confirm these settings match the official competition rules.</label>
          <p className="mt-2 text-xs leading-relaxed text-v-text-muted">Confirm Configuration saves these settings. The event is published separately in Review & Publish after contestants, criteria, judges, and any required reviewer are ready.</p>
        </>}
        <div className="mt-5 flex flex-col gap-3 border-t border-v-border pt-4 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={() => { setStage(2); setReviewAcknowledged(false) }}>{locked ? 'View Settings' : 'Edit Settings'}</Button>
          {!locked && <Button type="submit" disabled={!reviewAcknowledged || !readiness.canConfirm || reviewKey !== currentReviewKey || conflict} loading={busy}>Confirm Configuration</Button>}
        </div>
        {!locked && <div className="mt-3 flex justify-end"><Button size="sm" variant="ghost" onClick={() => { void save(false) }} disabled={conflict}>Save Draft</Button></div>}
      </Section>}
    </fieldset>
    {recovered && <p role="status" className="text-xs text-v-text-muted">Unsaved settings restored from this organizer’s local draft. Confirmation is required again.</p>}
    {conflict && <div role="alert" className="rounded-lg border border-v-warning/30 bg-v-surface p-3 text-sm text-v-text"><p>Saved rules changed while you were editing. Your edits are preserved. Review the latest saved settings before saving again.</p><Button variant="secondary" className="mt-2" onClick={useLatest}>Use latest saved settings</Button></div>}
    {error && <div role="alert" className="space-y-2 rounded-lg border border-v-warning/30 bg-v-surface p-3 text-sm text-v-text"><p>{error}</p>{refreshRequired && <Button variant="secondary" onClick={() => { void refreshSaved() }}>Reload saved rules</Button>}</div>}
    {success && <p role="status" className="flex items-start gap-2 text-sm text-v-success"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{success}</p>}
    {!locked && <p className="text-xs text-v-text-muted">{dirty ? 'Unsaved changes. Save these settings before continuing.' : !saved ? 'Choose your method, or save a draft to continue setup.' : baseline.confirmed ? readiness.readyForPublication ? 'Saved scoring rules are configured. Event-level checks still run at Review & Publish.' : 'Confirmed settings saved. Complete the remaining reviewer or panel setup before publication.' : 'Saved draft — this scoring step remains incomplete until the official rules are confirmed.'}</p>}
  </form>
}
