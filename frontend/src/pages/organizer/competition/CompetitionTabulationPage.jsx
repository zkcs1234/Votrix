import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { pageantService } from '@/services/pageant.service'
import { competitionTabulationService } from '@/services/competition-tabulation.service'

export default function CompetitionTabulationPage() {
  const { eventId } = useParams()
  const { success, error: showError } = useToast()
  const [contestants, setContestants] = useState([])
  const [deductions, setDeductions] = useState([])
  const [result, setResult] = useState(null)
  const [method, setMethod] = useState('weighted_average')
  const [form, setForm] = useState({ contestantId: '', amount: '', reason: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      const [{ data: contestantData }, { data: deductionData }] = await Promise.all([
        pageantService.listContestants(eventId),
        competitionTabulationService.listDeductions(eventId),
      ])
      setContestants(contestantData.contestants ?? [])
      setDeductions(deductionData.deductions ?? [])
      const { data: latestData } = await competitionTabulationService.getLatestCalculation(eventId).catch(() => ({ data: {} }))
      const latest = latestData.calculation
      if (latest) {
        setMethod(latest.configuration_snapshot?.method ?? 'weighted_average')
        setResult({
          calculationId: latest.id,
          status: latest.status,
          configuration: latest.configuration_snapshot,
          results: latest.result_snapshot,
          calculation: latest,
        })
      }
    } catch (err) {
      showError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [eventId, showError])

  useEffect(() => { load() }, [load])

  const addDeduction = async (event) => {
    event.preventDefault()
    setBusy('deduction')
    try {
      await competitionTabulationService.createDeduction(eventId, form)
      setForm({ contestantId: '', amount: '', reason: '' })
      await load()
      success('Deduction recorded separately from judge scores')
    } catch (err) {
      showError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const calculate = async () => {
    setBusy('calculate')
    try {
      const { data } = await competitionTabulationService.calculate(eventId, { method })
      setResult(data)
      success('Results calculated for review')
    } catch (err) {
      showError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const voidDeduction = async (deductionId) => {
    setBusy(`void:${deductionId}`)
    try {
      await competitionTabulationService.voidDeduction(eventId, deductionId)
      await load()
      success('Deduction voided')
    } catch (err) {
      showError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const transition = async (action, message) => {
    if (!result?.calculationId) return
    setBusy(action)
    try {
      const { data } = await competitionTabulationService[action](eventId, result.calculationId)
      const calculation = data.calculation
      setResult((current) => ({
        ...current,
        status: calculation?.status ?? data.status,
        results: calculation?.result_snapshot ?? current.results,
        calculationId: calculation?.id ?? current.calculationId,
        calculation,
      }))
      success(message)
    } catch (err) {
      showError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="v-page-title">Tabulation</h1>
        <p className="mt-1 text-sm text-v-text-muted">Calculate from submitted scores, review the snapshot, then finalize and publish.</p>
      </div>

      <section className="rounded-xl border border-v-border bg-v-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="v-section-title">Official deductions</h2>
            <p className="mt-1 text-sm text-v-text-muted">Deductions never modify the original judge scores.</p>
          </div>
          <Badge variant="default">{deductions.length} active</Badge>
        </div>
        <form onSubmit={addDeduction} className="mt-4 grid gap-3 md:grid-cols-[1fr_140px_2fr_auto]">
          <select required value={form.contestantId} onChange={(e) => setForm({ ...form, contestantId: e.target.value })} className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 text-sm text-v-text">
            <option value="">Select contestant</option>
            {contestants.map((c) => <option key={c.id} value={c.id}>#{c.contestantNumber} · {c.name}</option>)}
          </select>
          <input required min="0.01" step="0.01" type="number" placeholder="Points" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 text-sm text-v-text" />
          <input required placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 text-sm text-v-text" />
          <Button type="submit" loading={busy === 'deduction'}>Apply</Button>
        </form>
        {deductions.length > 0 && <ul className="mt-4 space-y-2">{deductions.map((d) => <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-v-border px-3 py-2 text-sm"><span>{contestants.find((c) => c.id === d.contestantId)?.name ?? 'Contestant'} · {d.reason}</span><span className="flex items-center gap-3"><strong className="text-v-danger">-{d.amount.toFixed(2)}</strong><button type="button" onClick={() => voidDeduction(d.id)} disabled={busy !== null} className="text-xs text-v-text-muted hover:text-v-text">Void</button></span></li>)}</ul>}
      </section>

      <section className="rounded-xl border border-v-border bg-v-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="v-section-title">Calculate official results</h2>
            <p className="mt-1 text-sm text-v-text-muted">Live Control stores judge scores. Select how those scores become the official result.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-v-text">
            <span className="text-v-text-muted">Tabulation method</span>
            <select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border border-v-border bg-v-surface-elevated px-3 py-2 text-sm text-v-text">
              <option value="weighted_average">Weighted average</option>
              <option value="average">Average</option>
              <option value="sum">Sum</option>
              <option value="highest_score">Highest score</option>
              <option value="lowest_removal">Lowest-score removal</option>
              <option value="rank_based">Rank-based</option>
            </select>
          </label>
          <Button onClick={calculate} loading={busy === 'calculate'}>Calculate</Button>
        </div>
        {method === 'rank_based' && <p className="mt-3 rounded-lg bg-v-surface-elevated p-3 text-sm text-v-text-muted">Each judge&apos;s numeric scores are converted into placements. The lowest combined placement total ranks highest.</p>}
        {result && <div className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm text-v-text-muted"><Badge variant="warning">{result.status ?? result.calculation?.status ?? 'calculated'}</Badge><span>Method: {result.configuration?.method ?? 'weighted_average'}</span><span>Judges submitted: {result.configuration?.judges?.submitted ?? '—'} / {result.configuration?.judges?.total ?? '—'}</span></div>
          <div className="overflow-x-auto rounded-lg border border-v-border"><table className="w-full text-left text-sm"><thead className="bg-v-surface-elevated text-v-text-muted"><tr><th className="p-3">Rank</th><th className="p-3">Contestant</th><th className="p-3">{result.configuration?.method === 'rank_based' ? 'Placement total' : 'Base score'}</th><th className="p-3">Deductions</th><th className="p-3">{result.configuration?.method === 'rank_based' ? 'Final placement total' : 'Final score'}</th></tr></thead><tbody>{(result.results ?? result.calculation?.result_snapshot ?? []).map((row) => <tr key={row.contestantId} className="border-t border-v-border"><td className="p-3 font-semibold">{row.rank}</td><td className="p-3">{row.contestantName}</td><td className="p-3">{Number(row.baseScore).toFixed(2)}</td><td className="p-3 text-v-danger">{result.configuration?.method === 'rank_based' ? `+${Number(row.deductionTotal).toFixed(2)}` : `-${Number(row.deductionTotal).toFixed(2)}`}</td><td className="p-3 font-semibold">{Number(row.finalScore).toFixed(2)}</td></tr>)}</tbody></table></div>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => transition('finalize', 'Results finalized')} disabled={busy || result.status === 'finalized' || result.calculation?.status === 'finalized'} loading={busy === 'finalize'}>Finalize results</Button><Button onClick={() => transition('publish', 'Results published')} disabled={busy || (result.status ?? result.calculation?.status) !== 'finalized'} loading={busy === 'publish'}>Publish results</Button></div>
        </div>}
      </section>
    </div>
  )
}
