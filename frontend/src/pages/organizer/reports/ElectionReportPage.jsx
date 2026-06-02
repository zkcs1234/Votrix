import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { reportsService } from '@/services/reports.service'
import {
  SkeletonReport,
  SkeletonChart,
  SkeletonStatCard,
} from '@/components/ui/Skeleton'
import ReportHeader from '@/components/reports/ReportHeader'
import TurnoutReport from '@/components/reports/TurnoutReport'
import BarChart from '@/components/reports/BarChart'
import StatCard from '@/components/reports/StatCard'
import { downloadCsv, downloadJson } from '@/utils/exportReport'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'

function ReportHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-7 w-64 animate-pulse rounded-lg bg-v-surface-elevated" />
      <div className="h-4 w-48 animate-pulse rounded-lg bg-v-surface-elevated" />
    </div>
  )
}

function ReportActionsSkeleton() {
  return (
    <div className="flex gap-2">
      <div className="h-8 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
      <div className="h-8 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
      <div className="h-8 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
    </div>
  )
}

export default function ElectionReportPage() {
  const { eventId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  // Use delayed loading
  const showLoader = useDelayedLoading(loading, 300)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await reportsService.getElectionReport(eventId)
      setReport(data.report)
    } catch (err) {
      console.error('Failed to load report:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [eventId])

  const handleExportCsv = async () => {
    setExporting(true)
    try {
      const rows = []
      for (const pos of report?.voteSummary?.positionSummaries ?? []) {
        for (const c of pos.candidates) {
          rows.push({
            position: pos.positionName,
            candidate: c.candidateName,
            votes: c.votes,
            votePercentage: c.votePercentage,
          })
        }
      }
      downloadCsv(`election-report-${eventId}.csv`, rows)
    } finally {
      setExporting(false)
    }
  }

  const handleExportJson = async () => {
    setExporting(true)
    try {
      downloadJson(`election-report-${eventId}.json`, report)
    } finally {
      setExporting(false)
    }
  }

  // Show nothing under 300ms
  if (loading && !showLoader) {
    return null
  }

  // Show skeleton after 300ms
  if (loading || showLoader) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 print:space-y-6">
        <div className="flex justify-between">
          <ReportHeaderSkeleton />
          <ReportActionsSkeleton />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="v-card-sm">
            <div className="h-4 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
          </div>
          <div className="v-card-sm">
            <div className="h-4 w-24 animate-pulse rounded-lg bg-v-surface-elevated" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
          </div>
        </div>

        <SkeletonChart />
        <SkeletonChart />
      </div>
    )
  }

  if (!report) return null

  return (
    <div className="mx-auto max-w-4xl space-y-8 print:space-y-6">
      <ReportHeader
        title={report.event.title}
        subtitle="Election report — turnout & vote summary"
        generatedAt={report.generatedAt}
      />

      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="rounded-lg border border-v-border px-3 py-1.5 text-sm text-v-text-muted disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
        <button
          type="button"
          onClick={handleExportJson}
          disabled={exporting}
          className="rounded-lg border border-v-border-strong px-3 py-1.5 text-sm text-v-text-muted disabled:opacity-50"
        >
          Export JSON
        </button>
      </div>

      <TurnoutReport
        title="Voter turnout"
        stats={{
          ...report.turnout,
          turnoutPercentage: report.turnout.turnoutPercentage,
        }}
        accentClass="text-v-text-muted"
        barColorClass="bg-v-primary"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total ballot selections" value={report.voteSummary.liveTotalVotes} />
        <StatCard label="Positions" value={report.voteSummary.positionSummaries?.length} />
      </div>

      <section className="v-card p-6">
        <h3 className="font-medium text-v-text">Overall vote summary</h3>
        <BarChart
          colorClass="bg-v-primary"
          items={(report.voteSummary.candidateResults ?? []).map((c) => ({
            id: c.candidateId,
            label: c.candidateName,
            count: c.votes,
          }))}
          valueKey="count"
          labelKey="label"
        />
      </section>

      {(report.voteSummary.positionSummaries ?? []).map((position) => (
        <section
          key={position.positionId}
          className="v-card p-6"
        >
          <div className="flex flex-wrap justify-between gap-2">
            <h3 className="font-medium text-v-text">{position.positionName}</h3>
            <span className="text-xs text-v-text-subtle">{position.totalVotes} votes</span>
          </div>
          {position.leader && (
            <p className="mt-2 text-sm text-v-text-muted">
              Leading: {position.leader.name} ({position.leader.votes} votes,{' '}
              {position.leader.votePercentage}%)
            </p>
          )}
          <div className="mt-4">
            <BarChart
              colorClass="bg-v-primary"
              items={position.candidates.map((c) => ({
                id: c.candidateId,
                label: c.candidateName,
                count: c.votes,
                percentage: c.votePercentage,
              }))}
              valueKey="count"
              labelKey="label"
            />
          </div>
        </section>
      ))}
    </div>
  )
}