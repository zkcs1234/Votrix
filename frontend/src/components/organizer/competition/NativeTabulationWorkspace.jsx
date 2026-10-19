import {tabulationDeductionReport} from '@/utils/tabulationDeductionReport'
import {applicableDeductionRules, rulesForDeductionRound, deductionStage} from '../../../../../shared/competition-deductions.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { BarChart3, BookOpen } from 'lucide-react'
import TabulationCalculationBreakdown from './TabulationCalculationBreakdown'
import TabulationScoreMatrix from './TabulationScoreMatrix'
import { TabulationMetrics, TabulationOverviewCards, TabulationJudgeSubmissions, TabulationAuditTrail, TabulationJudgeDeductions } from './TabulationOverview'
import { tabulationMethodName, tabulationReportRecords } from '@/utils/competitionTabulationPresentation'
import './NativeTabulationWorkspace.css'
import './TabulationDashboard.css'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import { nativeCompetitionService } from '@/services/competition-native.service'
import { nativeResultsService } from '@/services/competition-native-results.service'
import { nativeTabulationService as service } from '@/services/competition-native-tabulation.service'
import { downloadBlob } from '@/utils/csvDownload'
import { downloadCsv, downloadExcel, downloadPdf } from '@/utils/exportReport'
import { nextRound as getNextRound } from '../../../../../shared/competition-participation.js'

const key = (context) => `${context.competitionId}:${context.roundId ?? 'single'}`
const sectionStage = {
  overview: 'overview', submissions: 'submissions', matrix: 'entries',
  deductions: 'deductions', validation: 'calculate', finalization: 'results',
  results: 'ranking', audit: 'audit',
}
const stageSection = {
  overview: 'overview', submissions: 'submissions', entries: 'matrix',
  deductions: 'deductions', calculate: 'validation', results: 'finalization',
  ranking: 'results', audit: 'audit',
}
const message = (error) =>
  error.response?.data?.message ?? error.message ?? 'Unable to load current official sources'

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function getCriteria(configuration, roundId) {
  return (configuration?.criteria ?? []).filter(
    (criterion) =>
      configuration?.structure === 'multiple'
        ? criterion.roundId === roundId
        : criterion.roundId == null,
  )
}

function formatCriterionScore(source, criterion, pointsBasis) {
  const scores = source?.scores ?? {}
  const entries = pointsBasis
    ? Object.hasOwn(scores, criterion.id)
      ? [[criterion.id, scores[criterion.id]]]
      : []
    : Object.entries(scores)
  if (!entries.length) return 'Missing score'
  return entries
    .map(([targetId, value]) => {
      const target = criterion.minorCriteria?.find((minor) => minor.id === targetId)
      return target && criterion.minorCriteria.length > 1
        ? `${target.name}: ${value}`
        : String(value)
    })
    .join(' · ')
}

function formatCriterionHeader(criterion, pointsBasis) {
  const targets = !pointsBasis && criterion.minorCriteria?.length ? criterion.minorCriteria : [criterion]
  const ranges = targets
    .map(
      (target) =>
        `${target.name} [${target.minScore ?? '—'}–${target.maxScore ?? '—'}]${
          target.percentage == null ? '' : ` (${target.percentage}%)`
        }`,
    )
    .join(' · ')
  return pointsBasis
    ? `${criterion.name} (points) · ${ranges}`
    : `${criterion.name} (${criterion.percentage ?? '—'}%) · ${ranges}`
}

function describeCalculationMethod(method, scoringConfig) {
  if (method === 'sum') return 'Adds the complete judge totals.'
  if (method === 'highest_score') return 'Uses the highest complete judge total.'
  if (method === 'lowest_removal') {
    return `Averages judge totals after dropping ${scoringConfig.dropLowest ?? 0} lowest and ${scoringConfig.dropHighest ?? 0} highest score(s).`
  }
  if (method === 'rank_based') {
    return 'Ranks eligible entries by each judge’s adjusted total and adds their placements; a lower placement total ranks higher.'
  }
  if (method === 'manual') return 'Results use explicit organizer-entered placements; no numeric score is calculated.'
  if (method === 'weighted_average') return 'Averages the complete judge totals.'
  return 'No numeric calculation method is confirmed.'
}

function describeRoundProgression(round, configuration, method) {
  if (!round) return 'Single phase; no prior-round carry'
  if (round.progression === 'carry_forward') {
    return 'Carries eligible prior-round results into this round'
  }
  if (round.progression === 'weighted') {
    const carryBasis =
      method === 'rank_based' &&
      configuration.scoringConfig.numericCarryBasis === 'weighted_judge_average'
        ? ' Final ranking uses weighted numeric judge averages before placement ranking.'
        : ''
    return `${round.weight ?? 100}% contribution to the weighted-round result.${carryBasis}`
  }
  return 'Back to zero; this round is calculated without prior-round scores'
}

function getApplicableDeductionRules(configuration,roundId,owner='organizer') {
  return applicableDeductionRules(configuration,roundId,owner)
}

function downloadTableReport(filename, headers, rows, { format = 'csv', title = 'Competition Tabulation', subtitle = '', source = null, roundId = null } = {}) {
  const records = tabulationDeductionReport(tabulationReportRecords(headers, rows),source,roundId)
  headers = [...new Set(records.flatMap(record=>Object.keys(record)))]
  if (format === 'xls') downloadExcel(filename.replace(/\.csv$/, '.xls'), [{ name: 'Tabulation', rows: records }])
  else if (format === 'pdf') downloadPdf(filename.replace(/\.csv$/, '.pdf'), { title, subtitle, generatedAt: new Date(), sections: [{ title: 'Current round records', kind: 'table', columns: headers.map(header => ({ key: header, label: header })), rows: records }] })
  else downloadCsv(filename, records)
}

export function NativeTabulationBoundary({ eventId, Legacy, initialSection = 'overview' }) {
  const [params] = useSearchParams()
  const [state, setState] = useState(null)

  useEffect(() => {
    if (import.meta.env.VITE_COMPETITION_NATIVE_TABULATION_ENABLED !== 'true') return
    let alive = true
    setState(null)
    nativeCompetitionService
      .choices(eventId, true)
      .then(({ data }) => {
        if (alive) setState({ choices: data.contexts ?? [], nativeEvent: data.nativeEvent, eventName: data.eventName })
      })
      .catch((error) => {
        if (alive) setState({ error: message(error) })
      })
    return () => {
      alive = false
    }
  }, [eventId])

  if (import.meta.env.VITE_COMPETITION_NATIVE_TABULATION_ENABLED !== 'true') {
    return <Legacy eventId={eventId} initialSection={initialSection} />
  }
  if (!state) return <p role="status">Loading competition tabulation…</p>
  if (state.error) return <p role="alert">{state.error}</p>
  if (!state.choices.length && state.nativeEvent === true) {
    return (
      <p>
        Complete competition setup before tabulation.{' '}
        <Link to={`/organizer/competition/events/${eventId}/workspace`}>Open competition setup</Link>
      </p>
    )
  }
  if (!state.choices.length && state.nativeEvent !== false) {
    return <p role="alert">Competition identity is unavailable. Reconnect before continuing.</p>
  }
  if (!state.choices.length) return <Legacy eventId={eventId} initialSection={initialSection} />
  const requestedCompetition = params.get('competitionId'), requestedRound = params.get('roundId')
  const initialChoice = requestedCompetition ? state.choices.find(context => context.competitionId === requestedCompetition && (requestedRound == null || (context.roundId ?? null) === requestedRound)) : null
  if (requestedCompetition && !initialChoice) return <p role="alert">This competition or round is not available in the current tabulation context.</p>
  return <NativeTabulationWorkspace key={eventId} eventId={eventId} choices={state.choices.map(context => ({ ...context, eventName: state.eventName ?? context.eventName }))} initialChoice={initialChoice} initialSection={initialSection} />
}

export default function NativeTabulationWorkspace({
  eventId,
  choices,
  reviewer = false,
  initialChoice = null,
  initialSection = 'overview',
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const actorId = user?.id
  const [selected, setSelected] = useState(key(initialChoice ?? choices[0]))
  const initialSectionRef = useRef(initialSection)
  initialSectionRef.current = initialSection
  const choice = choices.find((context) => key(context) === selected) ?? choices[0]
  const identity = `${eventId}:${actorId}:${selected}:${reviewer}`
  const identityRef = useRef(identity)
  identityRef.current = identity
  const sequence = useRef(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [participant, setParticipant] = useState('')
  const [placements, setPlacements] = useState({})
  const [deduction, setDeduction] = useState({ entryId: '', ruleKey: '', offenseKey: '' })
  const [qualification, setQualification] = useState(null)
  const [qualifierIds, setQualifierIds] = useState([])
  const [sheetSelection, setSheetSelection] = useState(null)
  const [breakdownEntryId, setBreakdownEntryId] = useState('')
  const [focusedEntryId, setFocusedEntryId] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [activeStage, setActiveStage] = useState(sectionStage[initialSection] ?? 'overview')
  const [search, setSearch] = useState('')
  const [exportType, setExportType] = useState('')
  const [exportFormat, setExportFormat] = useState('csv')
  const [exportContextKey, setExportContextKey] = useState(selected)
  const [exportSnapshot, setExportSnapshot] = useState(null)
  const [exportSnapshotStatus, setExportSnapshotStatus] = useState('idle')
  const [exportJudge, setExportJudge] = useState('all')
  const [exportError, setExportError] = useState('')
  const [exportBusy, setExportBusy] = useState(false)
  const [officialExportStatus, setOfficialExportStatus] = useState('idle')
  const [officialExportMessage, setOfficialExportMessage] = useState('')
  const [categoryProgress, setCategoryProgress] = useState(null)
  const view =
    data?.eventId === eventId &&
    data.competitionId === choice.competitionId &&
    data.roundId === choice.roundId &&
    data.viewerId === actorId
      ? data
      : null
  const calculation = view?.complete ? view.calculation : null
  const exportContext =
    choices.find((context) => key(context) === exportContextKey) ?? choice
  const exportDeductionsEnabled =
    getApplicableDeductionRules(
      exportSnapshot?.rules?.configuration_snapshot,
      exportContext.roundId,
      null,
    ).length > 0

  const invalidate = useCallback(() => {
    sequence.current += 1
    setBreakdownEntryId('')
    setSheetSelection(null)
    setRulesOpen(false)
    setData(null)
    setQualification(null)
  }, [])

  const refresh = useCallback(async () => {
    const expected = identity
    const request = ++sequence.current
    setBreakdownEntryId('')
    setSheetSelection(null)
    setRulesOpen(false)
    setData(null)
    try {
      const { data: current } = await service.snapshot(
        eventId,
        choice.competitionId,
        choice.roundId,
        reviewer,
      )
      if (identityRef.current !== expected || request !== sequence.current) return
      if (
        current.eventId !== eventId ||
        current.competitionId !== choice.competitionId ||
        current.roundId !== choice.roundId
      ) {
        throw new Error('Official source context mismatch')
      }
      setData(current)
      setError(null)
    } catch (requestError) {
      if (identityRef.current === expected && request === sequence.current) {
        setData(null)
        setError(message(requestError))
      }
    }
  }, [eventId, choice, reviewer, identity])

  useEffect(() => {
    setData(null)
    setError(null)
    setBusy(false)
    setReason('')
    setParticipant('')
    setPlacements({})
    setDeduction({ entryId: '', ruleKey: '', offenseKey: '' })
    setQualification(null)
    setQualifierIds([])
    setSheetSelection(null)
    setBreakdownEntryId('')
    setFocusedEntryId('')
    setRulesOpen(false)
    setActiveStage(sectionStage[initialSectionRef.current] ?? 'overview')
    setSearch('')
    setExportType('')
    void refresh()
  }, [refresh])

  useEffect(() => {
    setActiveStage(sectionStage[initialSection] ?? 'overview')
  }, [initialSection])

  useEffect(() => {
    if (!exportType || !exportContext) {
      setExportSnapshot(null)
      setExportSnapshotStatus('idle')
      return undefined
    }
    let alive = true
    setExportSnapshot(null)
    setExportSnapshotStatus('loading')
    setExportError('')
    service
      .snapshot(eventId, exportContext.competitionId, exportContext.roundId)
      .then(({ data: result }) => {
        if (!alive) return
        if (
          result.eventId !== eventId ||
          result.competitionId !== exportContext.competitionId ||
          result.roundId !== exportContext.roundId ||
          result.viewerId !== actorId
        ) {
          throw new Error('Selected export context does not match the current competition.')
        }
        setExportSnapshot(result)
        setExportSnapshotStatus('ready')
      })
      .catch((requestError) => {
        if (!alive) return
        setExportSnapshotStatus('error')
        setExportError(message(requestError))
      })
    return () => {
      alive = false
    }
  }, [eventId, actorId, exportType, exportContext])

  useEffect(() => {
    if (exportType !== 'final' || !exportContext) {
      setOfficialExportStatus('idle')
      setOfficialExportMessage('')
      return undefined
    }
    let alive = true
    setOfficialExportStatus('checking')
    setOfficialExportMessage('')
    nativeResultsService
      .owned(eventId, exportContext.competitionId, exportContext.roundId)
      .then(({ data: result }) => {
        if (!alive) return
        const published =
          result.publication?.current === true &&
          ['publish', 'replace'].includes(result.publication.action) &&
          result.calculation?.id === result.publication.calculationId
        setOfficialExportStatus(published ? 'ready' : 'blocked')
        if (!published) {
          setOfficialExportMessage(
            'Only the current, finalized and published results can be exported as official.',
          )
        }
      })
      .catch((requestError) => {
        if (!alive) return
        setOfficialExportStatus('error')
        setOfficialExportMessage(message(requestError))
      })
    return () => {
      alive = false
    }
  }, [
    eventId,
    exportType,
    exportContext,
    exportContext?.competitionId,
    exportContext?.roundId,
  ])

  useCompetitionSync(eventId, refresh, {
    competitionId: choice.competitionId,
    roundId: choice.roundId,
    onInvalidate: invalidate,
  })

  const perform = async (operation) => {
    if (busy) return
    const expected = identity
    setBusy(true)
    try {
      await operation()
      if (identityRef.current === expected) {
        setQualification(null)
        await refresh()
      }
    } catch (operationError) {
      if (identityRef.current === expected) {
        setData(null)
        await refresh()
        if (identityRef.current === expected) setError(message(operationError))
      }
    } finally {
      if (identityRef.current === expected) setBusy(false)
    }
  }

  const body = () => ({
    roundId: choice.roundId,
    sourceDigest: view.sourceDigest,
    calculationId: calculation?.id,
    reason,
  })
  const round = view?.rules?.configuration_snapshot.rounds.find(
    (item) => item.id === choice.roundId,
  )
  const configuration = view?.rules?.configuration_snapshot
  const nextRound = round ? getNextRound(configuration?.rounds, round) : null
  const hasNext = !!nextRound
  const criteria = getCriteria(configuration, choice.roundId)
  const name = (id) => view?.entries?.find((entry) => entry.id === id)?.name ?? 'Entry'
  const groups = useMemo(
    () => [...new Map(choices.map((context) => [context.competitionId, context])).values()],
    [choices],
  )
  const nextCompetition = categoryProgress?.nextCompetition ?? null
  const method =
    round?.calculationMethod ?? configuration?.scoringConfig.calculationMethod
  const progress = view?.progress ?? []
  const submissions = view?.submissions ?? []
  const entryIds = view?.session?.entry_ids ?? []
  const entryCount = entryIds.length
  const resultRows = calculation?.output_snapshot?.results ?? []
  const resultByEntry = new Map(resultRows.map((result) => [result.contestantId, result]))
  const worksheets = calculation?.output_snapshot?.worksheets ?? []
  const configuredDeductionRules = configuration?.scoringConfig.deductionRules ?? []
  const deductionRules = getApplicableDeductionRules(configuration, choice.roundId)
  const proposalRules = rulesForDeductionRound(configuration,choice.roundId,'organizer')
  const hasOrganizerStage = proposalRules.length > 0
  const judgeDeductionsEnabled = getApplicableDeductionRules(configuration,choice.roundId,'judge').length > 0
  const judgeDeductionRows = view?.judgeDeductions ?? []
  const legacyDeductionReview = proposalRules.some(rule=>!rule.appliedBy)
  const selectedDeductionRule = proposalRules.find(rule=>rule.id===deduction.ruleKey)
  const deductionsEnabled = deductionRules.length > 0
  const configuredRuleIds = new Set(deductionRules.map((rule) => rule.id))
  const allDeductionRows = deductionsEnabled
    ? (view?.allDeductions ?? view?.deductions ?? []).filter((item) =>
        configuredRuleIds.has(item.rule_key),
      )
    : []
  const deductionRows = deductionsEnabled
    ? (view?.deductions ?? []).filter((item) => configuredRuleIds.has(item.rule_key))
    : []
  const calculationStatus = !view
    ? 'Calculating'
    : !view.complete || view.session?.status !== 'closed' || deductionsEnabled && !view.deductionsResolved
      ? 'Incomplete'
      : calculation
        ? 'Up to Date'
        : 'Needs Review'
  const calculationReady =
    !!view?.complete &&
    view.session?.status === 'closed' &&
    (!deductionsEnabled || view.deductionsResolved) &&
    !calculation?.finalized
  const manualReady =
    method !== 'manual' ||
    (reason.trim().length >= 5 &&
      entryCount > 0 &&
      entryIds.every(
        (entryId) =>
          Number.isSafeInteger(Number(placements[entryId])) &&
          Number(placements[entryId]) > 0,
      ))
  const scoreForEntry = (entryId, judgeId, criterion) => {
    const submission = submissions.find((item) => item.judge_id === judgeId)
    const source = submission?.sources.find(
      (row) => row.entry_id === entryId && row.criterion_id === criterion.id,
    )
    return formatCriterionScore(
      source,
      criterion,
      configuration?.scoringConfig.criterionBasis === 'points',
    )
  }
  const viewOriginalSheets = (entryId = '', judgeId = '') => {
    setFocusedEntryId(entryId)
    const judge = progress.find(item => item.judgeId === judgeId) ?? progress.find(item => item.submitted)
    setSheetSelection(judge ? { judgeId: judge.judgeId, submissionId: judge.submissionId } : null)
    selectStage('submissions')
  }
  const downloadEntryTabulation = (entryId) => {
    if (!view?.complete) return
    const entry = view.entries.find((item) => item.id === entryId)
    const result = resultByEntry.get(entryId)
    const headers = [
      'Record type',
      'Entry number',
      'Entry',
      'Judge',
      'Submission ID',
      'Submitted at',
      ...criteria.map((criterion) => formatCriterionHeader(
        criterion,
        configuration?.scoringConfig.criterionBasis === 'points',
      )),
      'Calculated judge total',
      'Calculated aggregate',
      ...(deductionsEnabled ? ['Approved deductions', 'Deduction status', 'Deduction reason'] : []),
      'Calculated score',
      'Official final score',
      'Place',
      'Scoring method',
      'Frozen rule revision',
      'Source digest',
    ]
    const rows = progress.filter((judge) => judge.submitted).map((judge) => {
      const submission = submissions.find((item) => item.judge_id === judge.judgeId)
      const worksheet = worksheets.find(
        (item) =>
          item.entryId === entryId &&
          item.judgeId === judge.judgeId &&
          item.roundId === choice.roundId,
      )
      return [
        'Original scores',
        entry?.contestantNumber ?? '',
        entry?.name ?? 'Entry',
        judge.judgeName,
        submission?.id ?? '',
        submission?.submitted_at ?? '',
        ...criteria.map((criterion) => scoreForEntry(entryId, judge.judgeId, criterion)),
        worksheet?.total ?? '',
        '',
        ...(deductionsEnabled ? ['', '', ''] : []),
        '',
        '',
        '',
        method ?? '',
        view.rules?.version ?? view.rules?.id ?? '',
        view.sourceDigest ?? '',
      ]
    })
    if (calculation && result) {
      rows.push([
        calculation.finalized ? 'Official result' : 'Calculated result',
        entry?.contestantNumber ?? '',
        entry?.name ?? 'Entry',
        '',
        '',
        '',
        ...criteria.map(() => ''),
        '',
        result.baseScore ?? '',
        ...(deductionsEnabled
          ? [
              result.deductionTotal ?? '',
              allDeductionRows
                .filter((item) => item.entry_id === entryId)
                .map((item) => item.status)
                .join('; '),
              allDeductionRows
                .filter((item) => item.entry_id === entryId)
                .map((item) => item.reason)
                .join('; '),
            ]
          : []),
        result.finalScore ?? '',
        calculation.finalized ? result.finalScore ?? '' : '',
        result.rank ?? '',
        method ?? '',
        view.rules?.version ?? view.rules?.id ?? '',
        view.sourceDigest ?? '',
      ])
    }
    if (deductionsEnabled) {
      rows.push(
        ...allDeductionRows
          .filter((item) => item.entry_id === entryId)
          .map((item) => [
            'Organizer deduction',
            entry?.contestantNumber ?? '',
            entry?.name ?? 'Entry',
            '',
            '',
            '',
            ...criteria.map(() => ''),
            '',
            '',
            item.rule_snapshot?.amount ?? '',
            item.status ?? '',
            item.reason ?? '',
            '',
            '',
            '',
            method ?? '',
            view.rules?.version ?? view.rules?.id ?? '',
            view.sourceDigest ?? '',
          ]),
      )
    }
    downloadTableReport(
      `competition-entry-${String(entry?.contestantNumber ?? entryId).replace(/[^a-zA-Z0-9-]/g, '-')}.csv`,
      headers,
      rows,
      {source:view,roundId:choice.roundId},
    )
  }

  const downloadJudgeSheet = async (judgeId, judgeName, submissionId) => {
    if (reviewer || !view?.complete || busy || !submissionId || !view.progress?.some(judge => judge.judgeId === judgeId && judge.submitted && judge.submissionId === submissionId)) return
    const expected = identity
    setBusy(true)
    setError(null)
    try {
      const response = await nativeResultsService.export(eventId, choice.competitionId, {
        kind: 'judge',
        roundId: choice.roundId ?? undefined,
        sourceDigest: view.sourceDigest,
        judgeId,
        submissionId,
      })
      if (identityRef.current !== expected) return
      downloadBlob(
        `judge-score-sheet-${judgeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
        response.data,
      )
    } catch (exportRequestError) {
      if (identityRef.current === expected) setError(message(exportRequestError))
    } finally {
      if (identityRef.current === expected) setBusy(false)
    }
  }

  const runExport = async () => {
    if (
      !exportContext ||
      exportBusy ||
      exportSnapshotStatus !== 'ready' ||
      !exportSnapshot?.complete
    ) {
      return
    }
    const exportIdentity = identity
    const exportSequence = sequence.current
    setExportBusy(true)
    setExportError('')
    try {
      const { data: sources } = await service.snapshot(
        eventId,
        exportContext.competitionId,
        exportContext.roundId,
      )
      if (identityRef.current !== exportIdentity || sequence.current !== exportSequence) return
      if (
        sources.eventId !== eventId ||
        sources.competitionId !== exportContext.competitionId ||
        sources.roundId !== exportContext.roundId ||
        sources.viewerId !== actorId ||
        !sources.complete
      ) {
        throw new Error('The selected round no longer has complete current sources.')
      }

      if (exportType === 'deductions') {
        const rules = getApplicableDeductionRules(
          sources.rules?.configuration_snapshot,
          exportContext.roundId,
          null,
        )
        if (!rules.length) {
          throw new Error('Organizer-managed deductions are disabled for this competition and round.')
        }
        const ruleIds = new Set(rules.map((rule) => rule.id))
        const deductions = sources.allDeductions ?? sources.deductions ?? []
        const headers = [
          'Entry',
          'Round',
          'Rule',
          'Offense reason',
          'Proposed by',
          'Recorded at',
          'Deduction',
          'Units',
          'Status',
          'Review action',
          'Reviewed by',
          'Review reason',
          'Reviewed at',
          'Responsible role',
        ]
        const rows = deductions.filter((item) => ruleIds.has(item.rule_key)).map((item) => {
          const roundName =
            choices.find((context) => context.roundId === item.scope_round_id)?.roundName ??
            exportContext.roundName
          return [
            sources.entries?.find((entry) => entry.id === item.entry_id)?.name ?? 'Entry',
            roundName,
            item.rule_key,
            item.reason,
            item.proposedByName,
            item.created_at,
            item.rule_snapshot?.amount,
            item.rule_snapshot?.units,
            item.status,
            item.review?.action,
            item.review?.actorName,
            item.review?.reason,
            item.review?.created_at,
            'Organizer',
          ]
        })
        rows.push(...(sources.judgeDeductions??[]).map(record=>[
          sources.entries?.find(entry=>entry.id===record.contestant_id)?.name??'Entry',
          choices.find(context=>context.roundId===record.round_id)?.roundName??exportContext.roundName,
          record.description,record.reason,record.judgeName,'',record.amount,record.units,'Submitted with judge sheet','','','','','Judge',
        ]))
        downloadTableReport('competition-deduction-report.csv', headers, rows, {format:exportFormat,title:'Deduction Report',subtitle:`${exportContext.competitionName} / ${exportContext.roundName}`})
      } else if (exportType === 'tabulation') {
        const configuration = sources.rules?.configuration_snapshot
        const configuredCriteria = getCriteria(configuration, exportContext.roundId)
        const pointsBasis = configuration?.scoringConfig.criterionBasis === 'points'
        const judges = (sources.progress ?? []).filter((judge) => judge.submitted)
        const method =
          configuration?.rounds?.find((item) => item.id === exportContext.roundId)
            ?.calculationMethod ?? configuration?.scoringConfig.calculationMethod
        const deductionsEnabled = getApplicableDeductionRules(
          configuration,
          exportContext.roundId,
        ).length > 0
        const headers = [
          'Record type',
          'Entry number',
          'Entry',
          'Judge',
          'Submission ID',
          'Submitted at',
          ...configuredCriteria.map(
            (criterion) => formatCriterionHeader(criterion, pointsBasis),
          ),
          'Calculated judge total',
          method === 'rank_based' ? 'Placement total' : 'Calculated aggregate',
          ...(deductionsEnabled ? ['Approved deduction total'] : []),
          'Calculated score',
          'Official final score',
          'Place',
          'Decision status',
          'Deduction reason',
          'Deduction round',
          'Actor',
          'Recorded at',
          'Scoring method',
          'Frozen rules version',
          'Source digest',
        ]
        const rows = []
        const blankRow = () => Array(headers.length).fill('')
        const columns = {
          judgeTotal: 6 + configuredCriteria.length,
          aggregate: 7 + configuredCriteria.length,
        }
        const deductionsColumn = columns.aggregate + 1
        const calculatedColumn = deductionsColumn + (deductionsEnabled ? 1 : 0)
        const officialColumn = calculatedColumn + 1
        const placeColumn = officialColumn + 1
        const statusColumn = placeColumn + 1
        const reasonColumn = statusColumn + 1
        const roundColumn = reasonColumn + 1
        const actorColumn = roundColumn + 1
        const recordedAtColumn = actorColumn + 1
        const methodColumn = recordedAtColumn + 1
        const versionColumn = methodColumn + 1
        const digestColumn = versionColumn + 1
        const results = new Map(
          (sources.calculation?.output_snapshot?.results ?? []).map((result) => [
            result.contestantId,
            result,
          ]),
        )
        const resultsByWorksheet = sources.calculation?.output_snapshot?.worksheets ?? []
        const configuredRuleIds = new Set(
          getApplicableDeductionRules(configuration, exportContext.roundId).map((rule) => rule.id),
        )
        const allDeductions = deductionsEnabled
          ? (sources.allDeductions ?? sources.deductions ?? []).filter((item) =>
              configuredRuleIds.has(item.rule_key),
            )
          : []
        const reportRow = blankRow()
        reportRow[0] = 'Report'
        reportRow[2] = exportContext.competitionName
        reportRow[3] = exportContext.roundName
        reportRow[methodColumn] = method
        reportRow[versionColumn] = sources.rules?.version ?? sources.rules?.id ?? ''
        reportRow[digestColumn] = sources.sourceDigest ?? ''
        rows.push(reportRow)
        for (const entryId of sources.session?.entry_ids ?? []) {
          const entry = sources.entries?.find((item) => item.id === entryId)
          const entryRow = blankRow()
          entryRow[0] = 'Entry'
          entryRow[1] = entry?.contestantNumber ?? ''
          entryRow[2] = entry?.name ?? 'Entry'
          rows.push(entryRow)
          for (const judge of judges) {
            const submission = sources.submissions?.find(
              (item) => item.judge_id === judge.judgeId,
            )
            const row = blankRow()
            row[0] = 'Original scores'
            row[1] = entry?.contestantNumber ?? ''
            row[2] = entry?.name ?? 'Entry'
            row[3] = judge.judgeName
            row[4] = submission?.id ?? ''
            row[5] = submission?.submitted_at ?? ''
            configuredCriteria.forEach((criterion, index) => {
              const source = submission?.sources.find(
                (item) => item.entry_id === entryId && item.criterion_id === criterion.id,
              )
              row[6 + index] = formatCriterionScore(source, criterion, pointsBasis)
            })
            const worksheet = resultsByWorksheet.find(
              (item) =>
                item.entryId === entryId &&
                item.judgeId === judge.judgeId &&
                item.roundId === exportContext.roundId,
            )
            row[columns.judgeTotal] = worksheet?.total ?? ''
            row[methodColumn] = method
            row[versionColumn] = sources.rules?.version ?? sources.rules?.id ?? ''
            row[digestColumn] = sources.sourceDigest ?? ''
            rows.push(row)
          }
          const result = results.get(entryId)
          if (result && sources.calculation) {
            const summary = blankRow()
            summary[0] = sources.calculation.finalized ? 'Official result' : 'Calculated result'
            summary[1] = entry?.contestantNumber ?? ''
            summary[2] = entry?.name ?? 'Entry'
            summary[columns.aggregate] = result.baseScore ?? ''
            if (deductionsEnabled) summary[deductionsColumn] = result.deductionTotal ?? ''
            summary[calculatedColumn] = result.finalScore ?? ''
            summary[officialColumn] = sources.calculation.finalized ? result.finalScore ?? '' : ''
            summary[placeColumn] = result.rank ?? ''
            summary[methodColumn] = method
            summary[versionColumn] = sources.rules?.version ?? sources.rules?.id ?? ''
            summary[digestColumn] = sources.sourceDigest ?? ''
            rows.push(summary)
          }
          for (const item of allDeductions.filter((decision) => decision.entry_id === entryId)) {
            const decision = blankRow()
            decision[0] = 'Organizer deduction'
            decision[1] = entry?.contestantNumber ?? ''
            decision[2] = entry?.name ?? 'Entry'
            decision[statusColumn] = item.status
            decision[reasonColumn] = `${item.rule_snapshot?.amount ?? ''} ${item.rule_snapshot?.units ?? ''} · ${item.reason ?? ''}`
            decision[roundColumn] =
              choices.find((context) => context.roundId === item.scope_round_id)?.roundName ??
              exportContext.roundName
            decision[actorColumn] = item.proposedByName ?? 'Organizer'
            decision[recordedAtColumn] = item.created_at ?? ''
            decision[methodColumn] = method
            decision[versionColumn] = sources.rules?.version ?? sources.rules?.id ?? ''
            decision[digestColumn] = sources.sourceDigest ?? ''
            rows.push(decision)
          }
        }
        downloadTableReport('competition-combined-scores.csv', headers, rows, {format:exportFormat,title:'Combined Scores',source:sources,roundId:exportContext.roundId,subtitle:`${exportContext.competitionName} / ${exportContext.roundName} / ${sources.calculation?.finalized?'Finalized calculation':sources.calculation?'Draft calculation':'Original submissions'}`})
      } else {
        let kind = exportType
        let judgeId
        if (exportType === 'judge') {
          if (exportJudge === 'all') {
            kind = 'worksheets'
          } else {
            judgeId = exportJudge
          }
        }
        if (exportType === 'final') {
          const { data: official } = await nativeResultsService.owned(
            eventId,
            exportContext.competitionId,
            exportContext.roundId,
          )
          const currentPublication =
            official.publication?.current === true &&
            ['publish', 'replace'].includes(official.publication.action) &&
            official.calculation?.id === official.publication.calculationId
          if (!currentPublication) {
            throw new Error(
              'Only the current, finalized and published results can be exported as official.',
            )
          }
        }
        const response = await nativeResultsService.export(
          eventId,
          exportContext.competitionId,
          {
            kind,
            roundId: exportContext.roundId ?? undefined,
            sourceDigest: sources.sourceDigest,
            calculationId:
              ['tabulation', 'final'].includes(kind)
                ? sources.calculation?.id
                : undefined,
            judgeId,
          },
        )
        if (identityRef.current !== exportIdentity || sequence.current !== exportSequence) return
        downloadBlob(
          `competition-${exportContext.competitionId}-${exportContext.roundId ?? 'single'}-${kind}.csv`,
          response.data,
        )
      }
      setExportType('')
    } catch (exportRequestError) {
      if (identityRef.current === exportIdentity && sequence.current === exportSequence) setExportError(message(exportRequestError))
    } finally {
      setExportBusy(false)
    }
  }

  const openExport = (type, format = 'csv') => {
    if (type === 'deductions' && !deductionsEnabled) return
    setExportType(type)
    setExportFormat(format)
    setExportContextKey(selected)
    setExportJudge('all')
    setExportError('')
  }

  const exportLabels = {
    judge: 'Judge Score Sheets',
    tabulation: 'Combined Scores',
    final: 'Official Results',
    ...(deductionsEnabled||judgeDeductionsEnabled ? { deductions: 'Deduction Report' } : {}),
  }

  const steps = [
    { id: 'overview', label: 'Overview', description: 'Round overview and contestant scores', available: !!view, complete: false },
    { id: 'submissions', label: 'Judge Submissions', description: 'Inspect original submitted judge sheets', available: !!view, complete: !!view?.complete },
    { id: 'entries', label: 'Tabulation Matrix', description: 'One row per contestant with saved judge totals and criterion contributions', available: !!view, complete: !!calculation },
    ...(hasOrganizerStage || judgeDeductionsEnabled ? [{ id: 'deductions', label: legacyDeductionReview ? 'Deductions' : hasOrganizerStage ? 'Organizer Deductions' : 'Judge Deductions', description: hasOrganizerStage ? 'Configured organizer deduction decisions' : 'Read-only submitted judge deductions', available: !!view, complete: !!view?.deductionsResolved }] : []),
    { id: 'calculate', label: 'Validation', description: 'Validate current calculation sources and scoring rules', available: !!view?.complete && view.session?.status === 'closed', complete: !!calculation },
    { id: 'results', label: 'Finalization', description: 'Independent review and official finalization', available: !!calculation, complete: !!calculation?.finalized },
    ...(calculation?.finalized ? [{
      id: 'next',
      label: hasNext
        ? 'Next Round'
        : categoryProgress?.status === 'ready' && categoryProgress.allComplete
          ? 'Competition Complete'
          : categoryProgress?.status === 'ready' && categoryProgress.currentComplete && nextCompetition
            ? 'Next Category'
            : 'Category Wrap-up',
      description: hasNext
        ? 'Confirm eligible advancement'
        : 'Complete and publish this category before moving to another category',
      available: true,
      complete: categoryProgress?.status === 'ready' && categoryProgress.currentComplete,
    }] : []),
  ]
  const extraStages = [
    { id: 'ranking', label: 'Results & Rankings', description: 'Configured ranks and tie rules', available: !!calculation },
    { id: 'audit', label: 'Audit Trail', description: 'Recorded submission and calculation activity', available: !!view },
  ]
  const allStages = [...steps, ...extraStages]
  const stageIndex = steps.findIndex((step) => step.id === activeStage)
  const activeStep = allStages.find(step => step.id === activeStage) ?? steps[0]
  const canContinueFromStage = (stepId) => {
    if (['overview', 'submissions', 'entries'].includes(stepId)) return view?.complete === true
    if (stepId === 'deductions') return view?.complete === true && view.deductionsResolved === true
    if (stepId === 'calculate') return !!calculation
    if (stepId === 'ranking') return !!calculation
    if (stepId === 'results') return !!calculation?.finalized
    return false
  }
  const nextStage = steps[stageIndex + 1]
  const canOpenStep = (step) => step.available || step.id === activeStage
  const tiedPlacements = [...new Set(
    resultRows
      .filter((result) => result.rank != null)
      .map((result) => result.rank)
      .filter((rank, _, ranks) => ranks.filter((candidate) => candidate === rank).length > 1),
  )].map((rank) => ({
    rank,
    entries: resultRows.filter((result) => result.rank === rank),
  }))
  const advancementCount =
    round?.advancementType === 'top_n'
      ? Math.floor(Number(round.advancementValue))
      : round?.advancementType === 'top_percent'
        ? Math.ceil((resultRows.length * Number(round.advancementValue)) / 100)
        : 0
  const cutoffRank =
    advancementCount > 0
      ? [...resultRows].sort((a, b) => a.rank - b.rank)[
          Math.min(advancementCount, resultRows.length) - 1
        ]?.rank
      : null
  const advancementCutoffTie = tiedPlacements.some((group) => group.rank === cutoffRank)
  const activeStageIsAvailable = allStages.some(
    (step) => step.id === activeStage && step.available,
  )
  const selectStage = (stage) => {
    setActiveStage(stage)
    const section = stageSection[stage]
    if (!reviewer && section && section !== initialSection) {
      navigate(`/organizer/competition/events/${eventId}/tabulation/${section}?competitionId=${choice.competitionId}${choice.roundId ? `&roundId=${choice.roundId}` : ''}`)
    }
  }
  useEffect(() => {
    if (view && !activeStageIsAvailable) setActiveStage('overview')
  }, [view, activeStageIsAvailable])
  useEffect(() => {
    if (reviewer || activeStage !== 'next' || hasNext || !calculation?.finalized) {
      setCategoryProgress(null)
      return undefined
    }
    let alive = true
    setCategoryProgress({ status: 'loading' })
    const inspectCategory = async (group) => {
      const contexts = choices.filter((context) => context.competitionId === group.competitionId)
      const representative = contexts[0]
      if (!representative) throw new Error(`No tabulation context is available for ${group.competitionName}.`)
      const sourceChoice = group.competitionId === choice.competitionId && view?.rules
        ? choice
        : representative
      const source = group.competitionId === choice.competitionId && view?.rules
        ? view
        : (await service.snapshot(eventId, group.competitionId, representative.roundId, false)).data
      if (
        source.eventId !== eventId ||
        source.competitionId !== group.competitionId ||
        source.roundId !== (sourceChoice.roundId ?? null) ||
        source.viewerId !== actorId
      ) {
        throw new Error(`The tabulation context for ${group.competitionName} changed. Refresh and try again.`)
      }
      const configuration = source.rules?.configuration_snapshot
      if (!configuration) throw new Error(`Scoring rules are unavailable for ${group.competitionName}.`)
      const rounds = configuration.rounds ?? []
      const mainRounds = rounds
        .filter((item) => item.purpose !== 'special')
        .sort((left, right) => Number(left.displayOrder ?? 0) - Number(right.displayOrder ?? 0))
      const roundContexts = configuration.structure === 'multiple'
        ? mainRounds.map((item) => contexts.find((context) => context.roundId === item.id))
        : configuration.structure === 'single'
          ? [contexts.find((context) => context.roundId == null)]
          : []
      if (!roundContexts.length || roundContexts.some((context) => !context)) {
        throw new Error(`Configured rounds are unavailable for ${group.competitionName}.`)
      }
      const roundStates = await Promise.all(roundContexts.map(async (context) => {
        const result = (await nativeResultsService.owned(
          eventId,
          group.competitionId,
          context.roundId,
        )).data
        if (
          result.eventId !== eventId ||
          result.competitionId !== group.competitionId ||
          result.roundId !== (context.roundId ?? null) ||
          result.viewerId !== actorId
        ) {
          throw new Error(`Official results context mismatch for ${group.competitionName}.`)
        }
        return { context, result }
      }))
      const terminalRoundIds = configuration.structure === 'multiple'
        ? mainRounds.filter((item) => !getNextRound(mainRounds, item)).map((item) => item.id)
        : [null]
      const terminalStates = roundStates.filter(({ context }) =>
        terminalRoundIds.includes(context.roundId ?? null),
      )
      const roundsFinalized = roundStates.length > 0 && roundStates.every(({ result }) =>
        result.complete === true && result.calculation?.finalized === true,
      )
      const terminalRoundsPublished = terminalStates.length > 0 && terminalStates.every(({ result }) =>
        result.publication?.current === true &&
        ['publish', 'replace'].includes(result.publication.action) &&
        result.publication.calculationId === result.calculation?.id,
      )
      const complete = roundsFinalized && terminalRoundsPublished
      const nextRoundToFinish = roundStates.find(({ result }) =>
        result.complete !== true || result.calculation?.finalized !== true,
      )
      const terminalRoundToPublish = terminalStates.find(({ result }) =>
        result.publication?.current !== true ||
        !['publish', 'replace'].includes(result.publication.action) ||
        result.publication.calculationId !== result.calculation?.id,
      )
      return {
        competitionId: group.competitionId,
        complete,
        nextChoice: nextRoundToFinish?.context ?? terminalRoundToPublish?.context ?? roundContexts[0],
      }
    }
    const inspectAllCategories = async () => {
      const categories = await Promise.all(groups.map(inspectCategory))
      if (!alive) return
      const current = categories.find((item) => item.competitionId === choice.competitionId)
      const currentIndex = groups.findIndex((item) => item.competitionId === choice.competitionId)
      const next = current?.complete
        ? Array.from({ length: Math.max(0, groups.length - 1) }, (_, index) =>
            groups[(currentIndex + index + 1) % groups.length],
          )
          .map((group) => categories.find((item) => item.competitionId === group.competitionId))
          .find((item) => item && !item.complete)
        : null
      setCategoryProgress({
        status: 'ready',
        currentComplete: current?.complete === true,
        allComplete: current?.complete === true && !next,
        nextCompetition: next
          ? {
              ...groups.find((item) => item.competitionId === next.competitionId),
              nextChoice: next.nextChoice,
            }
          : null,
      })
    }
    inspectAllCategories().catch((requestError) => {
      if (alive) setCategoryProgress({ status: 'error', message: message(requestError) })
    })
    return () => {
      alive = false
    }
  }, [
    reviewer,
    activeStage,
    hasNext,
    calculation?.id,
    calculation?.finalized,
    choices,
    groups,
    choice,
    eventId,
    actorId,
    view,
  ])
  const loadQualification = async () => {
    const expected = identity
    const request = sequence.current
    try {
      const { data: proposal } = await service.qualification(
        eventId,
        choice.competitionId,
        body(),
      )
      if (identityRef.current === expected && request === sequence.current) {
        setQualification(proposal)
        setQualifierIds(proposal.automatic)
      }
    } catch (requestError) {
      if (identityRef.current === expected) setError(message(requestError))
    }
  }
  const proceedToNextRound = async () => {
    if (!nextRound || !calculation?.finalized || busy) return
    const nextChoice = choices.find(
      (context) =>
        context.competitionId === choice.competitionId &&
        context.roundId === nextRound.id,
    )
    if (!nextChoice) {
      setError(`The ${nextRound.name} round is not available in the current competition context.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data: nextSnapshot } = await service.snapshot(
        eventId,
        choice.competitionId,
        nextRound.id,
        reviewer,
      )
      if (
        nextSnapshot.eventId !== eventId ||
        nextSnapshot.competitionId !== choice.competitionId ||
        nextSnapshot.roundId !== nextRound.id
      ) {
        throw new Error('Next-round source context mismatch')
      }
      if (nextSnapshot.qualificationCurrent !== true) {
        throw new Error('Confirm the eligible advancement roster before opening the next round.')
      }
      setSelected(key(nextChoice))
      setActiveStage('entries')
    } catch (requestError) {
      setError(message(requestError))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="v-competition-workflow v-tabulation space-y-4">
      <header className="v-tabulation-page-header space-y-3">
        <div className="v-tabulation-header">
          <div className="v-tabulation-title"><span className="v-tabulation-title-icon"><BarChart3 size={26} aria-hidden="true"/></span><div>
            {choice.eventName && (
              <p className="text-sm font-medium text-v-text-muted">{choice.eventName}</p>
            )}
            <h1 className="v-page-title">{choice.competitionName}</h1>
            <p className="v-caption">
              {choice.roundName} · Official Tabulation
            </p>
          </div></div>
          {!reviewer && (
            <details className="relative">
              <summary className="v-press cursor-pointer list-none rounded-lg bg-v-primary px-4 py-2 text-sm font-semibold text-white">
                Export <span aria-hidden="true">▾</span>
              </summary>
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-v-border bg-v-surface p-2 shadow-lg">
                {Object.entries(exportLabels).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-v-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!view?.complete || busy}
                    onClick={() => openExport(type)}
                  >
                    <span className="block font-medium">{label}</span>
                    <span className="text-xs text-v-text-muted">
                      {type === 'judge' && 'Original individual or all judge sheets'}
                      {type === 'tabulation' && 'Current combined scoring spreadsheet'}
                      {type === 'deductions' && 'Decisions and review statuses'}
                      {type === 'final' && 'Current published official results'}
                    </span>
                  </button>
                ))}
                <div className="mt-1 border-t border-v-border pt-1">
                  {[
                    ['CSV', 'csv'],
                    ['Excel', 'xls'],
                    ['PDF', 'pdf'],
                  ].map(([label, format]) => (
                    <button
                      key={format}
                      type="button"
                      className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-v-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!view?.complete || busy}
                      onClick={() => openExport('tabulation', format)}
                    >
                      Export All Entries ({label})
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}
        </div>

        <div className="v-tabulation-context">
          <label className="min-w-52 flex-1 text-sm font-medium">
            Competition
            <select
              aria-label="Competition"
              className="v-input mt-1"
              value={choice.competitionId}
              disabled={busy || exportBusy}
              onChange={(event) => {
                const next = choices.find(
                  (context) => context.competitionId === event.target.value,
                )
                if (next) setSelected(key(next))
              }}
            >
              {groups.map((context) => (
                <option key={context.competitionId} value={context.competitionId}>
                  {context.competitionName}
                </option>
              ))}
            </select>
          </label>
          {choices.some(
            (context) => context.competitionId === choice.competitionId && context.roundId != null,
          ) && (
            <label className="min-w-48 flex-1 text-sm font-medium">
              Round
              <select
                aria-label="Round"
                className="v-input mt-1"
                value={selected}
                disabled={busy || exportBusy}
                onChange={(event) => setSelected(event.target.value)}
              >
                {choices
                  .filter((context) => context.competitionId === choice.competitionId)
                  .map((context) => (
                    <option key={key(context)} value={key(context)}>
                      {context.roundName}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {view && (
            <>
              {configuration ? (
                <div><Button variant="secondary" onClick={() => setRulesOpen(true)}><BookOpen size={16} aria-hidden="true"/>View Scoring Rules</Button>
                <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="Scoring Rules" id="scoring-rules" size="lg" footer={<Button variant="secondary" onClick={() => setRulesOpen(false)}>Close Rules</Button>}>
                <p className="text-sm text-v-text-muted">{choice.competitionName} / {choice.roundName}</p>
                <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <dt className="text-v-text-muted">Calculation method</dt>
                    <dd>{tabulationMethodName(method, configuration.scoringConfig)}. {describeCalculationMethod(method, configuration.scoringConfig)}</dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Criterion basis</dt>
                    <dd>
                      {configuration.scoringConfig.criterionBasis === 'points'
                        ? 'Configured raw points'
                        : 'Normalize to 100%, then apply criterion weights'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Round progression</dt>
                    <dd>{describeRoundProgression(round, configuration, method)}</dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Advancement</dt>
                    <dd>
                      {hasNext && round?.advancementType
                        ? `${round.advancementType.replaceAll('_', ' ')}${
                            round.advancementValue == null ? '' : ` (${round.advancementValue})`
                          }`
                        : hasNext ? 'All entries continue' : 'Final round - no outgoing advancement'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Tie policy</dt>
                    <dd>
                      {configuration.scoringConfig.tiePolicy === 'highest_criterion' &&
                      method !== 'rank_based'
                        ? 'Highest criterion breaks equal scores'
                        : 'Equal calculated scores share placement'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Organizer-managed deductions</dt>
                    <dd>{deductionsEnabled ? 'Enabled for this round scope' : 'Disabled for this round'}</dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Frozen rule revision</dt>
                    <dd>{view.rules?.version ?? view.rules?.id ?? 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Result precision</dt>
                    <dd>{configuration.scoringConfig.decimalPlaces ?? 2} decimal places</dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Score input precision</dt>
                    <dd>{configuration.scoringConfig.inputDecimalPlaces == null ? 'Existing precision' : configuration.scoringConfig.inputDecimalPlaces === 0 ? 'Whole numbers' : `Up to ${configuration.scoringConfig.inputDecimalPlaces} decimal places`}. Individual criterion settings take precedence.</dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Ranking scope</dt>
                    <dd>{configuration.scoringConfig.perDivision ? 'Within each configured division' : 'All eligible entries'}</dd>
                  </div>
                  {method === 'manual' && <div><dt className="text-v-text-muted">Manual official decision basis</dt><dd>{configuration.scoringConfig.manualBasis ?? 'Not specified'}</dd></div>}
                </dl>
                <div className="mt-3">
                  <p className="font-medium">Configured criteria and score ranges</p>
                  <ul className="mt-1 grid gap-1 text-v-text-muted sm:grid-cols-2">
                    {criteria.map((criterion) => (
                      <li key={criterion.id}>
                        {formatCriterionHeader(
                          criterion,
                          configuration.scoringConfig.criterionBasis === 'points',
                        )}
                      </li>
                    ))}
                    {!criteria.length && <li>No criteria configured for this round.</li>}
                  </ul>
                </div>
                {deductionsEnabled && <div className="mt-3"><p className="font-medium">Applicable deduction rules</p><ul className="mt-1 space-y-1 text-sm text-v-text-muted">{getApplicableDeductionRules(configuration, choice.roundId).map(rule => <li key={rule.id}>{rule.description} · {rule.amount} {rule.units}{rule.roundId ? ` · ${configuration.rounds.find(item => item.id === rule.roundId)?.name ?? 'Configured round'}` : ''}{rule.criteriaId ? ` · ${configuration.criteria.find(item => item.id === rule.criteriaId)?.name ?? 'Configured criterion'}` : ''}</li>)}</ul></div>}
                </Modal></div>
              ) : (
                <p className="w-full text-sm text-v-text-muted">
                  Frozen scoring rules are unavailable until current source validation completes.
                </p>
              )}
            </>
          )}
        </div>

        {view && <TabulationMetrics view={view}/>}
      </header>

      {error && (
        <p role="alert" className="v-error-text">
          {error}
        </p>
      )}
      {!view && !error && <p role="status">Checking current submission completeness…</p>}

      {view && (
        <div className="v-tabulation-layout">
        <main className="min-w-0 space-y-4">
        <>
          <nav className="v-tabulation-stages" aria-label="Tabulation stages">
            <h2 id="tabulation-workflow-heading" className="sr-only">
              Tabulation workflow
            </h2>
            <ol role="tablist" aria-label="Tabulation workflow" className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {steps.map((step, index) => (
                <li
                  key={step.id}
                  className="min-w-max"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeStage === step.id}
                    aria-current={activeStage === step.id ? 'step' : undefined}
                    aria-label={`${step.label}: ${step.complete ? 'complete' : step.available ? 'available' : 'blocked'}`}
                    disabled={!canOpenStep(step)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                      activeStage === step.id
                        ? 'border-v-primary bg-v-primary-soft text-v-primary'
                        : step.complete
                          ? 'border-v-border-strong bg-v-surface'
                          : 'border-v-border bg-v-surface'
                    }`}
                    onClick={() => selectStage(step.id)}
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-v-surface-elevated tabular-nums">
                      {step.complete ? '✓' : index + 1}
                    </span>
                    {step.label}
                  </button>
                </li>
              ))}
            </ol>

          </nav>
          {activeStage === 'overview' && <TabulationOverviewCards view={view} choice={choice} criteria={criteria} method={method} onStage={selectStage} onExport={openExport} reviewer={reviewer} busy={busy} hasDeductions={hasOrganizerStage || judgeDeductionsEnabled}/>}
          {['overview', 'entries'].includes(activeStage) && <TabulationScoreMatrix key={`matrix:${identity}`} view={view} roundId={choice.roundId} criteria={criteria} method={method} search={search} onSearch={setSearch} selectedEntryId={focusedEntryId || view.entries?.[0]?.id} onSelectEntry={setFocusedEntryId} onOriginals={viewOriginalSheets} onBreakdown={setBreakdownEntryId} onExportEntry={downloadEntryTabulation} onExport={() => openExport('tabulation')} reviewer={reviewer} busy={busy}/>}
          {activeStage === 'submissions' && <TabulationJudgeSubmissions view={view} choice={choice} selection={sheetSelection} onSelect={setSheetSelection} onDownload={downloadJudgeSheet} reviewer={reviewer} busy={busy}/>}
          {activeStage === 'deductions' && judgeDeductionsEnabled && <TabulationJudgeDeductions records={judgeDeductionRows} complete={view.complete}/>}
          {activeStage === 'audit' && <><TabulationAuditTrail view={view}/>{view.complete && <details className="v-tab-panel"><summary>Source version details</summary><dl className="v-tab-facts"><div><dt>Frozen rule version</dt><dd>{view.rules?.version ?? view.rules?.id}</dd></div><div><dt>Current calculation</dt><dd>{calculation ? `Version ${calculation.version}` : 'Unavailable'}</dd></div><div><dt>Source digest</dt><dd className="break-all">{view.sourceDigest}</dd></div><div><dt>Current submissions</dt><dd>{submissions.length}</dd></div></dl></details>}</>}

          {activeStage === 'ranking' && (
          <section className="v-card-sm space-y-3" aria-labelledby="ranking-comparison-heading">
            <div>
              <h2 id="ranking-comparison-heading" className="v-section-title">
                Overall ranking and tie rules
              </h2>
              <p className="v-caption">
                Standings below are the saved backend calculation for this competition and round.
                They remain drafts until independently verified and finalized.
              </p>
            </div>
            {calculation ? (
              <>
              {tiedPlacements.length > 0 && (
                <section
                  className="rounded-lg border border-v-border bg-v-surface-elevated p-3"
                  aria-labelledby="tie-rules-heading"
                >
                  <h3 id="tie-rules-heading" className="font-semibold">Tied placements</h3>
                  <p className="mt-1 text-sm text-v-text-muted">
                    {configuration.scoringConfig.tiePolicy === 'highest_criterion' &&
                    method !== 'rank_based'
                      ? 'The configured highest-criterion rule has already been applied by the official calculation. Any remaining equal results share placement.'
                      : 'The frozen rules assign equal results the same placement; no separate tie-break decision is configured.'}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {tiedPlacements.map((group) => (
                      <li key={group.rank}>
                        Place {group.rank}: {group.entries.map((entry) => name(entry.contestantId)).join(', ')}
                        {group.rank === cutoffRank && (
                          <span className="text-v-text-muted"> · advancement cutoff</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {advancementCutoffTie && (
                    <p className="mt-2 text-sm">
                      The configured {round.advancementType.replaceAll('_', ' ')} rule advances
                      every entry sharing the cutoff placement. The backend qualifier proposal
                      will include the entire tied group; the frozen policy does not allow a
                      manual tie-break override.
                    </p>
                  )}
                  {round?.advancementType === 'manual' && (
                    <p className="mt-2 text-sm">
                      Advancement is configured as manual. Review and record the qualifier roster
                      with a reason in the Next Round stage.
                    </p>
                  )}
                </section>
              )}
              <div className="v-table-wrap">
                <table className="v-tab-grid">
                  <caption className="sr-only">
                    Backend-calculated entry standings and configured rank breakdown
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Place</th>
                      <th scope="col">Entry</th>
                      {method === 'rank_based' &&
                        progress
                          .filter((judge) => judge.submitted)
                          .map((judge) => (
                            <th key={judge.judgeId} scope="col">
                              Judge rank · {judge.judgeName ?? 'Judge'}
                            </th>
                          ))}
                      <th scope="col">
                        {method === 'rank_based' ? 'Placement total' : 'Calculated aggregate'}
                      </th>
                      {deductionsEnabled && <th scope="col">Applicable deductions</th>}
                      <th scope="col">
                        {calculation.finalized ? 'Official final score' : 'Calculated score'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.map((result) => (
                      <tr key={result.contestantId}>
                        <td className="font-semibold tabular-nums">{result.rank ?? '—'}</td>
                        <th scope="row">
                          {String(
                            view.entries.find((entry) => entry.id === result.contestantId)
                              ?.contestantNumber ?? '—',
                          ).padStart(3, '0')}{' '}
                          — {name(result.contestantId)}
                        </th>
                        {method === 'rank_based' &&
                          progress
                            .filter((judge) => judge.submitted)
                            .map((judge) => (
                              <td key={judge.judgeId} className="text-center tabular-nums">
                                {result.judgeRanks?.[judge.judgeId] ?? '—'}
                              </td>
                            ))}
                        <td className="tabular-nums">{result.baseScore ?? '—'}</td>
                        {deductionsEnabled && (
                          <td className="tabular-nums">{result.deductionTotal ?? '—'}</td>
                        )}
                        <td className="font-semibold tabular-nums">
                          {result.finalScore ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            ) : (
              <p className="rounded-lg border border-v-border p-3 text-sm text-v-text-muted">
                No calculated standings are available yet. Calculate official results to show
                backend-derived aggregates and placements; no preview scores are estimated here.
              </p>
            )}
          </section>
          )}

          {['results', 'deductions'].includes(activeStage) && (
          <div className="space-y-4">
            {(activeStage==='results'||legacyDeductionReview) && <section className="v-card-sm space-y-3">
              <div>
                <h2 className="v-section-title">Independent review</h2>
                <p className="v-caption">A separate reviewer verifies the official calculation.</p>
              </div>
              {view.reviewPolicy ? (
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-v-text-muted">Assigned reviewer</dt>
                    <dd className="font-medium">
                      {view.reviewPolicy.reviewerName ?? 'Assigned reviewer'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Appointment</dt>
                    <dd>{view.reviewPolicy.active ? 'Active' : 'Needs attention'}</dd>
                  </div>
                  <div>
                    <dt className="text-v-text-muted">Review progress</dt>
                    <dd>
                      {calculation?.verified
                        ? 'Verified'
                        : calculation
                          ? 'Awaiting verification'
                          : 'Ready after calculation'}
                    </dd>
                  </div>
                </dl>
              ) : (
                !reviewer && (
                  <fieldset disabled={busy} className="space-y-2">
                    <legend className="text-sm font-medium">Assign an independent reviewer</legend>
                    <label className="block text-sm">
                      Reviewer
                      <select
                        aria-label="Independent reviewer"
                        className="v-input mt-1"
                        value={participant}
                        onChange={(event) => setParticipant(event.target.value)}
                      >
                        <option value="">Choose an active score reviewer</option>
                        {view.reviewerOptions?.map((reviewerOption) => (
                          <option
                            key={reviewerOption.participantId}
                            value={reviewerOption.participantId}
                          >
                            {reviewerOption.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      disabled={!participant}
                      loading={busy}
                      onClick={() =>
                        perform(() =>
                          service.appoint(eventId, choice.competitionId, participant),
                        )
                      }
                    >
                      Assign Reviewer
                    </Button>
                  </fieldset>
                )
              )}
              <label className="block text-sm">
                Review notes / decision reason
                <textarea
                  aria-label="Review reason"
                  className="v-input mt-1 min-h-20"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Add notes used to support a formal review decision."
                />
              </label>
              {reviewer && calculation && !calculation.verified && (
                <Button
                  disabled={busy || reason.trim().length < 5}
                  loading={busy}
                  onClick={() =>
                    perform(() =>
                      service.transition(
                        eventId,
                        choice.competitionId,
                        { ...body(), action: 'verify' },
                        true,
                      ),
                    )
                  }
                >
                  Verify calculation
                </Button>
              )}
            </section>}

            {activeStage === 'deductions' && hasOrganizerStage && (
            <section className="v-card-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="v-section-title">{legacyDeductionReview ? 'Deduction decisions' : 'Organizer Deductions'}</h2>
                  <p className="v-caption">
                    Original scores stay separate. New organizer rules apply directly; historical rules retain independent approval.
                  </p>
                </div>
                <span className="rounded-full bg-v-surface-elevated px-2 py-1 text-xs">
                  {deductionRows.length} decisions
                </span>
              </div>
              {!reviewer && proposalRules.length > 0 && (
                <fieldset disabled={busy} className="grid gap-2 sm:grid-cols-2">
                  <legend className="text-sm font-medium">Record a configured organizer deduction</legend>
                  <select
                    aria-label="Deduction contestant"
                    className="v-input"
                    value={deduction.entryId}
                    onChange={(event) =>
                      setDeduction({ ...deduction, entryId: event.target.value })
                    }
                  >
                    <option value="">Choose entry</option>
                    {entryIds.map((entryId) => (
                      <option key={entryId} value={entryId}>
                        {name(entryId)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Deduction rule"
                    className="v-input"
                    value={deduction.ruleKey}
                    onChange={(event) =>
                      setDeduction({ ...deduction, ruleKey: event.target.value })
                    }
                  >
                    <option value="">Choose configured rule</option>
                    {proposalRules.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.description}
                        {rule.criteriaId
                          ? ` · ${criteria.find((criterion) => criterion.id === rule.criteriaId)?.name ?? 'criterion'}`
                          : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Offense identity"
                    className="v-input"
                    placeholder="Unique offense reference"
                    value={deduction.offenseKey}
                    onChange={(event) =>
                      setDeduction({ ...deduction, offenseKey: event.target.value })
                    }
                  />
                  {!legacyDeductionReview && <label className="block text-sm sm:col-span-2">Deduction reason<textarea aria-label="Deduction reason" className="v-input mt-1" value={reason} onChange={event=>setReason(event.target.value)} placeholder="Explain the violation (at least five characters)." /></label>}
                  {selectedDeductionRule && <p className="v-helper-text sm:col-span-2">{deductionStage(selectedDeductionRule)}</p>}
                  <Button
                    className="sm:col-span-2 sm:justify-self-start"
                    disabled={
                      !deduction.entryId ||
                      !deduction.ruleKey ||
                      !deduction.offenseKey.trim() ||
                      reason.trim().length < 5
                    }
                    loading={busy}
                    onClick={() =>
                      perform(() =>
                        service.deduction(eventId, choice.competitionId, {
                          ...body(),
                          ...deduction,
                          action: 'propose',
                        }),
                      )
                    }
                  >
                    {selectedDeductionRule?.appliedBy==='organizer'||!legacyDeductionReview?'Apply Deduction':'Propose Deduction'}
                  </Button>
                </fieldset>
              )}
              {deductionRows.length ? (
                <div className="v-table-wrap">
                <table className="v-table min-w-[600px]">
                  <thead>
                    <tr>
                      <th scope="col">Round</th>
                      <th scope="col">Entry</th>
                      <th scope="col">Configured scope</th>
                      <th scope="col">Reason</th>
                      <th scope="col">Actor / time</th>
                      <th scope="col">Deduction</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductionRows.map((item) => {
                      const configuredRule = configuredDeductionRules.find(
                        (rule) => rule.id === item.rule_key,
                      )
                      const criterion = configuration.criteria.find(
                        (configuredCriterion) =>
                          configuredCriterion.id === configuredRule?.criteriaId,
                      )
                      return (
                        <tr key={item.id}>
                          <td>
                            {choices.find(
                              (context) =>
                                context.competitionId === choice.competitionId &&
                                context.roundId === item.scope_round_id,
                            )?.roundName ?? choice.roundName}
                          </td>
                          <td>{name(item.entry_id)}</td>
                          <td>{criterion ? criterion.name : 'Whole round'}</td>
                          <td>{item.reason || item.rule_key}</td>
                          <td>
                            <span>{item.proposedByName ?? 'Organizer'}</span>
                            <span className="block text-xs text-v-text-muted">
                              {formatDate(item.created_at)}
                            </span>
                            {item.review?.actorName && (
                              <span className="block text-xs text-v-text-muted">
                                Reviewed by {item.review.actorName} ·{' '}
                                {formatDate(item.review.created_at)}
                              </span>
                            )}
                          </td>
                          <td className="tabular-nums">
                            {item.rule_snapshot.amount} {item.rule_snapshot.units}
                          </td>
                          <td>{item.rule_snapshot?.appliedBy==='organizer'&&item.status==='approve'?'Applied by organizer':item.status}</td>
                          <td>
                            {reviewer && !item.rule_snapshot?.appliedBy &&
                              ['pending', 'approve'].includes(item.status) &&
                              (item.status === 'pending' ? ['approve', 'reject'] : ['revoke']).map(
                                (action) => (
                                  <Button
                                    key={action}
                                    size="sm"
                                    variant={action === 'approve' ? 'primary' : 'secondary'}
                                    className="mr-1"
                                    disabled={busy || reason.trim().length < 5}
                                    loading={busy}
                                    onClick={() =>
                                      perform(() =>
                                        service.deduction(
                                          eventId,
                                          choice.competitionId,
                                          { ...body(), action, decisionId: item.id },
                                          true,
                                        ),
                                      )
                                    }
                                  >
                                    {action}
                                  </Button>
                                ),
                              )}
                            {!reviewer && item.rule_snapshot?.appliedBy==='organizer' && item.status==='approve' && <Button size="sm" variant="secondary" disabled={busy||reason.trim().length<5} onClick={()=>perform(()=>service.deduction(eventId,choice.competitionId,{...body(),action:'revoke',decisionId:item.id}))}>Reverse deduction</Button>}
                            {!reviewer && !item.rule_snapshot?.appliedBy && <span className="text-v-text-muted">Reviewer action</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </div>
              ) : (
                <p className="rounded-lg border border-v-border p-3 text-sm text-v-text-muted">
                  No organizer deductions are recorded for this configured round scope.
                </p>
              )}
            </section>
            )}
          </div>
          )}

          {activeStage === 'calculate' && <section className="v-card-sm space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="v-section-title">Automatic score calculation</h2>
                <p className="v-caption">
                  The server recalculates from complete submitted sources and approved deductions. Incomplete sources never produce official rankings.
                </p>
              </div>
              <p role="status" className="v-tab-badge" data-tone={calculationStatus === 'Up to Date' ? 'success' : calculationStatus === 'Incomplete' ? 'warning' : 'danger'}>
                {calculationStatus}
              </p>
            </div>
            <div className="v-tab-calculation-method">
              <h3>{tabulationMethodName(method, configuration?.scoringConfig)}</h3>
              <p>{describeCalculationMethod(method, configuration?.scoringConfig ?? {})}</p>
              <p>{describeRoundProgression(round, configuration, method)}</p>
              {method !== 'manual' && <ul className="mt-2 flex flex-wrap gap-2" aria-label="Configured criterion weights">
                {criteria.map(criterion => <li key={criterion.id} className="v-tab-badge">{criterion.name}{configuration?.scoringConfig.criterionBasis === 'points' ? ' · Points' : ` · ${criterion.percentage}%`}</li>)}
              </ul>}
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['All required sheets submitted', !!view.complete],
                ['Scoring session closed', view.session?.status === 'closed'],
                ...(deductionsEnabled
                  ? [['Configured deduction decisions resolved', !!view.deductionsResolved]]
                  : []),
              ].map(([label, ready]) => (
                <li key={label} className="flex items-center gap-2">
                  <span aria-hidden="true">{ready ? '✓' : '!'}</span>
                  <span>{label}</span>
                  <span className="sr-only">{ready ? 'Complete' : 'Incomplete'}</span>
                </li>
              ))}
            </ul>
            {!calculationReady && !reviewer && !calculation?.finalized && (
              <p className="text-sm text-v-text-muted">
                Calculation is unavailable until all applicable prerequisites are met
                {deductionsEnabled ? ', including configured deduction reviews.' : '.'}
              </p>
            )}
            {method === 'manual' && !reviewer && view.complete && (
              <fieldset disabled={busy} className="space-y-2">
                <legend className="text-sm font-medium">Explicit manual placements</legend>
                {entryIds.map((entryId) => (
                  <label key={entryId} className="flex items-center justify-between gap-3 text-sm">
                    {name(entryId)}
                    <input
                      aria-label={`${name(entryId)} placement`}
                      className="v-input max-w-28"
                      type="number"
                      min="1"
                      step="1"
                      value={placements[entryId] ?? ''}
                      onChange={(event) =>
                        setPlacements({ ...placements, [entryId]: event.target.value })
                      }
                    />
                  </label>
                ))}
                <label className="block text-sm">
                  Placement decision reason
                  <textarea aria-label="Manual placement reason" className="v-input mt-1 min-h-20" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the basis for these manual placements." />
                </label>
                <Button
                  disabled={!calculationReady || !manualReady || busy}
                  loading={busy}
                  onClick={() =>
                    perform(() =>
                      service.calculate(eventId, choice.competitionId, {
                        ...body(),
                        manualResults: entryIds.map((entryId) => ({
                          contestantId: entryId,
                          rank: Number(placements[entryId]),
                        })),
                      }),
                    )
                  }
                >
                  Save manual placements
                </Button>
                {!manualReady && (
                  <p className="text-sm text-v-text-muted">
                    Enter a positive placement for every entry and provide a placement decision reason.
                  </p>
                )}
              </fieldset>
            )}
          </section>}

          {activeStage === 'results' && calculation && (
            <section className="v-card-sm space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="v-section-title">Final results</h2>
                  <p className="v-caption">
                    Version {calculation.version} · {method} · precision{' '}
                    {configuration.scoringConfig.decimalPlaces ?? 2} ·{' '}
                    {calculation.finalized
                      ? 'Finalized'
                      : calculation.verified
                        ? 'Verified'
                        : 'Awaiting independent verification'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!reviewer &&
                    calculation.verified &&
                    !calculation.finalized && (
                      <Button
                        disabled={busy || reason.trim().length < 5}
                        loading={busy}
                        onClick={() =>
                          perform(() =>
                            service.transition(eventId, choice.competitionId, {
                              ...body(),
                              action: 'finalize',
                            }),
                          )
                        }
                      >
                        Finalize official calculation
                      </Button>
                    )}
                  {!reviewer && (
                    <Link
                      className="inline-flex items-center rounded-lg border border-v-border-strong px-3 py-2 text-sm font-medium hover:bg-v-surface-elevated"
                      to={`/organizer/competition/events/${eventId}/report`}
                    >
                      Publish Results
                    </Link>
                  )}
                </div>
              </div>
              {!calculation.verified && !reviewer && (
                <p className="text-sm text-v-text-muted">
                  An independent reviewer must verify this calculation before it can be finalized.
                </p>
              )}
              <p className="v-caption">Scores remain in the contestant matrix. Review the current standings and tie rules before final approval.</p>
              <div className="v-tab-inline-actions"><Button size="sm" variant="secondary" onClick={() => selectStage('entries')}>View Score Matrix</Button><Button size="sm" variant="secondary" onClick={() => selectStage('ranking')}>Results & Rankings</Button><Button size="sm" variant="secondary" onClick={() => selectStage('audit')}>Audit Trail</Button></div>
            </section>
          )}
        {activeStage === 'next' && (
          <section className="v-card-sm space-y-4">
            <div>
              <h2 className="v-section-title">
                {hasNext
                  ? 'Round completed'
                  : categoryProgress?.status === 'ready' && categoryProgress.allComplete
                    ? 'Competition completed'
                    : categoryProgress?.status === 'ready' && categoryProgress.currentComplete
                      ? 'Category completed'
                      : 'Category wrap-up'}
              </h2>
              <p className="v-caption">
                {choice.competitionName} · {choice.roundName} · Finalized calculation version{' '}
                {calculation?.version}
              </p>
            </div>
            {hasNext ? (
              <>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-v-text-muted">Next round</dt>
                    <dd className="font-semibold">{nextRound?.name ?? 'Configured next round'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-v-text-muted">Advancement rule</dt>
                    <dd className="font-semibold">
                      {round?.advancementType?.replaceAll('_', ' ') ?? 'No elimination configured'}
                      {round?.advancementValue != null ? ` · ${round.advancementValue}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-v-text-muted">Score policy</dt>
                    <dd className="font-semibold">
                      {describeRoundProgression(nextRound, configuration, nextRound?.calculationMethod)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-v-text-muted">Next-round judges</dt>
                    <dd className="font-semibold">
                      {view.rules.assignment_snapshot?.filter(
                        (assignment) =>
                          assignment.round_id == null || assignment.round_id === nextRound?.id,
                      ).length ?? 'Configured for the next round'}
                    </dd>
                  </div>
                </dl>
                {round?.advancementType === 'manual' && (
                  <p className="rounded-lg border border-v-border bg-v-surface-elevated p-3 text-sm">
                    Manual advancement is configured. The organizer must review the tied
                    standings and confirm the selected qualifier roster with a reason.
                  </p>
                )}
                {!reviewer && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      loading={busy && !qualification}
                      onClick={loadQualification}
                    >
                      {qualification ? 'Refresh Advancement Proposal' : 'Review Advancement'}
                    </Button>
                    <Button
                      disabled={busy}
                      loading={busy}
                      onClick={proceedToNextRound}
                    >
                      Proceed to {nextRound?.name ?? 'Next Round'}
                    </Button>
                  </div>
                )}
                {qualification && (
                  <fieldset disabled={busy} className="space-y-2 rounded-lg border border-v-border p-3">
                    <legend className="px-1 text-sm font-semibold">
                      Confirm qualifier roster ({qualification.policy})
                    </legend>
                    {qualification.standings.map((standing) => (
                      <label key={standing.contestantId} className="block text-sm">
                        <input
                          type="checkbox"
                          checked={qualifierIds.includes(standing.contestantId)}
                          disabled={qualification.policy !== 'manual'}
                          onChange={(event) =>
                            setQualifierIds(
                              event.target.checked
                                ? [...qualifierIds, standing.contestantId]
                                : qualifierIds.filter((id) => id !== standing.contestantId),
                            )
                          }
                        />{' '}
                        {name(standing.contestantId)} · rank {standing.rank}
                      </label>
                    ))}
                    <p className="v-caption">
                      The roster comes from finalized standings and the configured advancement
                      policy. Confirmation freezes the eligible next-round entries.
                    </p>
                    <label className="block text-sm">
                      Advancement decision reason
                      <textarea aria-label="Review reason" className="v-input mt-1 min-h-20" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the reviewed qualifier roster." />
                    </label>
                    <Button
                      disabled={busy || reason.trim().length < 5}
                      loading={busy}
                      onClick={() =>
                        perform(() =>
                          service.qualification(
                            eventId,
                            choice.competitionId,
                            { ...body(), qualifierIds, acknowledged: true },
                            true,
                          ),
                        )
                      }
                    >
                      Confirm reviewed qualifiers
                    </Button>
                  </fieldset>
                )}
              </>
            ) : (
              <>
                {!reviewer && categoryProgress?.status === 'loading' && (
                  <p role="status" className="v-caption">Checking this category’s rounds and published results…</p>
                )}
                {!reviewer && categoryProgress?.status === 'error' && (
                  <p role="alert" className="v-caption">{categoryProgress.message}</p>
                )}
                {!reviewer && categoryProgress?.status === 'ready' && !categoryProgress.currentComplete && (
                  <p className="rounded-lg border border-v-border bg-v-surface-elevated/50 p-3 text-sm">
                    Finish and finalize every configured round, then publish the terminal round’s results before proceeding to another category.
                  </p>
                )}
                {!reviewer && categoryProgress?.status === 'ready' && categoryProgress.currentComplete && categoryProgress.nextCompetition && (
                  <p className="rounded-lg border border-v-border bg-v-surface-elevated/50 p-3 text-sm">
                    This category’s rounds are finalized and its terminal results are published. You can proceed to the next category that still needs tabulation.
                  </p>
                )}
                {!reviewer && categoryProgress?.status === 'ready' && categoryProgress.allComplete && (
                  <p className="rounded-lg border border-v-border bg-v-surface-elevated/50 p-3 text-sm">
                    Every configured category has completed its rounds and published its terminal results.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="inline-flex items-center rounded-lg border border-v-border-strong px-3 py-2 text-sm font-medium hover:bg-v-surface-elevated"
                    to={`/organizer/competition/events/${eventId}/report`}
                  >
                    View Finalized Report
                  </Link>
                  {!reviewer && nextCompetition?.nextChoice && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSelected(key(nextCompetition.nextChoice))
                        setActiveStage('overview')
                      }}
                    >
                      Proceed to {nextCompetition.competitionName}
                    </Button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
        <nav className="v-tab-stage-footer" aria-label="Stage navigation" hidden={stageIndex < 0}>
          <Button
            variant="secondary"
            disabled={stageIndex <= 0 || busy}
            onClick={() => selectStage(steps[stageIndex - 1]?.id ?? 'entries')}
          >
            ← Previous
          </Button>
          <span className="text-sm text-v-text-muted">
            {stageIndex + 1} of {steps.length} · {activeStep?.label}
          </span>
          <Button
            disabled={!nextStage || !nextStage.available || !canContinueFromStage(activeStage) || busy}
            onClick={() => nextStage && selectStage(nextStage.id)}
          >
            {nextStage
              ? `${activeStage === 'results' && hasNext ? 'Next Round' : 'Next'}: ${nextStage.label} →`
              : 'Complete required actions to continue'}
          </Button>
        </nav>
        </>
        </main>
        </div>
      )}

      {view?.complete && calculation && breakdownEntryId && view.entries?.some(entry => entry.id === breakdownEntryId) && <TabulationCalculationBreakdown key={`${selected}:${breakdownEntryId}:${calculation.id}`} entry={view.entries.find(entry => entry.id === breakdownEntryId)} roundId={choice.roundId} roundName={choice.roundName} configuration={configuration} calculation={calculation} progress={progress} onClose={() => setBreakdownEntryId('')}/>}

      {exportType && (
        <Modal open onClose={() => { if (!exportBusy) setExportType('') }} closeDisabled={exportBusy} closeOnBackdrop={!exportBusy} title={`Export ${exportLabels[exportType]}`} id="tabulation-export" size="sm">
          <div className="space-y-4">
            <p className="v-caption">Exports use current sources for this competition and the selected round. Judge sheets and published official results use CSV; combined scores and deduction reports also support Excel and PDF.</p>
            <label className="block text-sm">
              Competition round
              <select
                className="v-input mt-1"
                aria-label="Export round"
                value={exportContextKey}
                disabled={exportBusy}
                onChange={(event) => setExportContextKey(event.target.value)}
              >
                {choices
                  .filter((context) => context.competitionId === choice.competitionId)
                  .map((context) => (
                    <option key={key(context)} value={key(context)}>
                      {context.roundName}
                    </option>
                  ))}
              </select>
            </label>
            {exportType === 'judge' && (
              <label className="block text-sm">
                Judges
                <select
                  className="v-input mt-1"
                  aria-label="Export judges"
                  value={exportJudge}
                  disabled={exportBusy}
                  onChange={(event) => setExportJudge(event.target.value)}
                >
                  <option value="all">All judges</option>
                  {(exportSnapshot?.progress ?? []).map((judge) => (
                    <option key={judge.judgeId} value={judge.judgeId} disabled={!judge.submitted}>
                      {judge.judgeName}
                      {judge.submitted ? '' : ' — pending'}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              File format
              <select className="v-input mt-1" aria-label="Export format" value={exportFormat} disabled={exportBusy || !['tabulation','deductions'].includes(exportType)} onChange={event => setExportFormat(event.target.value)}>
                <option value="csv">CSV</option>{['tabulation','deductions'].includes(exportType)&&<><option value="xls">Excel (.xls)</option><option value="pdf">PDF (print)</option></>}
              </select>
            </label>
            {exportSnapshotStatus === 'ready' && exportSnapshot?.complete && (
              <section
                className="rounded-lg border border-v-border bg-v-surface-elevated/40 p-3 text-sm"
                aria-label="Export scope preview"
              >
                <h3 className="font-semibold">Export scope</h3>
                <p className="mt-1">
                  {exportContext.competitionName} · {exportContext.roundName}
                </p>
                <p className="mt-1 text-v-text-muted">
                  {(exportSnapshot.session?.entry_ids ?? []).length} eligible entries ·{' '}
                  {(exportSnapshot.progress ?? []).filter((judge) => judge.submitted).length}{' '}
                  current judge sheets ·{' '}
                  {getCriteria(
                    exportSnapshot.rules?.configuration_snapshot,
                    exportContext.roundId,
                  ).length}{' '}
                  configured criteria
                </p>
                <p className="mt-1 text-v-text-muted">
                  {exportType === 'tabulation'
                    ? 'Entry-by-entry rows with judges, configured criteria, and separate calculated-result rows.'
                    : exportLabels[exportType]}
                  {exportDeductionsEnabled &&
                    ['tabulation', 'deductions', 'final'].includes(exportType) &&
                    ' · configured organizer deductions included'}
                  {!exportDeductionsEnabled &&
                    ['tabulation', 'deductions', 'final'].includes(exportType) &&
                    ' · organizer deductions excluded'}
                </p>
                <p className="mt-1 text-xs text-v-text-muted">
                  Frozen rule revision {exportSnapshot.rules?.version ?? exportSnapshot.rules?.id ?? 'unavailable'} · source{' '}
                  {exportSnapshot.sourceDigest ?? 'unavailable'}
                </p>
                {['tabulation', 'final'].includes(exportType) &&
                  !exportSnapshot.calculation && (
                    <p className="mt-2 text-v-text-muted">
                      No calculated result rows exist in this snapshot; this export will not
                      estimate scores or placements.
                    </p>
                  )}
              </section>
            )}
            {exportType === 'final' && officialExportStatus !== 'ready' && (
              <p
                className="text-sm text-v-text-muted"
                role={officialExportStatus === 'error' ? 'alert' : 'status'}
              >
                {officialExportStatus === 'checking'
                  ? 'Checking current publication status…'
                  : officialExportMessage ||
                    'Official export requires the current finalized results to be published.'}
              </p>
            )}
            {exportSnapshotStatus === 'loading' && (
              <p role="status" className="text-sm text-v-text-muted">
                Checking current sources for the selected round…
              </p>
            )}
            {exportSnapshotStatus === 'ready' && !exportSnapshot?.complete && (
              <p className="text-sm text-v-text-muted">
                Exports are available after every required current judge sheet and qualification is
                complete.
              </p>
            )}
            {exportType === 'deductions' &&
              exportSnapshotStatus === 'ready' &&
              exportSnapshot?.complete &&
              !exportDeductionsEnabled && (
                <p className="text-sm text-v-text-muted">
                  Organizer-managed deductions are disabled for the selected round.
                </p>
              )}
            {exportError && <p role="alert" className="v-error-text">{exportError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={exportBusy}
                onClick={() => setExportType('')}
              >
                Cancel
              </Button>
              <Button
                loading={exportBusy}
                disabled={
                  exportBusy ||
                  exportSnapshotStatus !== 'ready' ||
                  !exportSnapshot?.complete ||
                  (exportType === 'judge' &&
                    exportJudge !== 'all' &&
                    !exportSnapshot.progress.some(
                      (judge) => judge.judgeId === exportJudge && judge.submitted,
                    )) ||
                  (exportType === 'final' && officialExportStatus !== 'ready')
                  || (exportType === 'deductions' && !exportDeductionsEnabled)
                }
                onClick={runExport}
              >
                Export {exportFormat==='xls'?'Excel':exportFormat.toUpperCase()}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
