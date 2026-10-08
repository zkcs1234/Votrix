/**
 * Polling analytics — module-local metric/report adapters.
 *
 * Maps the raw polling analytics + report payload to the generic shape
 * expected by shared analytics components. No imports from election or
 * competition modules; no shared event bus.
 */

import { withPercentage, topN, sumBy } from '@/modules/analytics/utils/aggregations'
import { safePercentage } from '@/modules/analytics/utils/format'

const QUESTION_TYPE_LABEL = {
  single_choice: 'Single choice',
  checkbox: 'Checkbox',
  yes_no: 'Yes / No',
  text: 'Text',
  rating: 'Rating',
  choice: 'Choice',
}

export function pollingQuestionTypeLabel(type) {
  return QUESTION_TYPE_LABEL[type] ?? type
}

export function buildPollingStats(analytics) {
  const total = analytics?.respondedRespondents ?? 0
  const enrolled = analytics?.enrolledRespondents ?? 0

  return [
    { id: 'respondents', label: 'Registered respondents', value: enrolled },
    { id: 'responses', label: 'Respondents who responded', value: total, tone: 'success' },
    { id: 'not-responded', label: 'Respondents who have not responded', value: Math.max(enrolled - total, 0) },
    {
      id: 'rate',
      label: 'Overall response rate',
      value: `${safePercentage(total, enrolled)}%`,
      tone: 'muted',
    },
  ]
}

export function buildPollingParticipationGroups(analytics, dimension) {
  const rows = dimension === 'program'
    ? analytics?.participationByProgram
    : analytics?.participationByYearSection
  return (rows ?? []).map((row) => ({
    id: row.label,
    label: row.label,
    registered: row.registered ?? 0,
    responded: row.responded ?? 0,
    notResponded: row.notResponded ?? 0,
    responseRate: row.responseRate ?? 0,
  }))
}

export function buildPollingQuestionStats(analytics) {
  return (analytics?.questions ?? []).map((q) => ({
    id: q.questionId,
    name: q.question,
    value: q.responseCount ?? 0,
    sublabel: pollingQuestionTypeLabel(q.type),
  }))
}

export function buildPollingMostSelected(analytics) {
  // Aggregate the most-selected options across all choice questions.
  const options = []
  for (const q of analytics?.questions ?? []) {
    if (q.type === 'choice' || q.type === 'single_choice' || q.type === 'checkbox' || q.type === 'yes_no') {
      for (const o of q.options ?? []) {
        options.push({
          id: `${q.questionId}-${o.optionId}`,
          name: o.label,
          value: o.count ?? 0,
          sublabel: q.question,
          percentage: o.percentage,
        })
      }
    }
  }
  return topN(options, 10, 'value')
}

export function buildPollingRatingDistributions(analytics) {
  return (analytics?.questions ?? [])
    .filter((q) => q.type === 'rating')
    .map((q) => ({
      id: q.questionId,
      name: q.question,
      value: Number(q.average ?? 0),
      sublabel: `Average ${Number(q.average ?? 0).toFixed(2)} / 5`,
      meta: (q.distribution ?? [])
        .map((d) => `${d.rating}★: ${d.count} (${d.percentage}%)`)
        .join(' · '),
      // Items for bar chart rendering
      items: (q.distribution ?? []).map((d) => ({
        id: `${q.questionId}-${d.rating}`,
        label: `${d.rating}★`,
        value: d.count ?? 0,
        percentage: d.percentage,
      })),
    }))
}

export function buildPollingParticipationTrend(analytics) {
  // Use question response counts as the per-step series.
  return buildPollingQuestionStats(analytics)
}

export function buildPollingReportSheets(report) {
  const summary = report?.responseSummary ?? {}
  return [
    {
      name: 'Summary',
      rows: [
        {
          event: report?.event?.title ?? '',
          mode: summary.pollAnonymous ? 'Anonymous' : 'Identified',
          totalSubmissions: summary.totalSubmissions ?? 0,
          enrolledRespondents: summary.enrolledRespondents ?? 0,
          respondedRespondents: summary.respondedRespondents ?? 0,
          notRespondedRespondents: summary.notRespondedRespondents ?? 0,
          responseRate: `${summary.responseRate ?? 0}%`,
        },
      ],
    },
    {
      name: 'Program participation',
      rows: (report?.participationByProgram ?? []).map((row) => ({
        program: row.label,
        registered: row.registered,
        responded: row.responded,
        notResponded: row.notResponded,
        responseRate: `${row.responseRate}%`,
      })),
    },
    {
      name: 'Year section participation',
      rows: (report?.participationByYearSection ?? []).map((row) => ({
        yearSection: row.label,
        registered: row.registered,
        responded: row.responded,
        notResponded: row.notResponded,
        responseRate: `${row.responseRate}%`,
      })),
    },
    {
      name: 'Questions',
      rows: (report?.questions ?? []).map((q) => ({
        type: pollingQuestionTypeLabel(q.type),
        question: q.question,
        responseCount: q.responseCount ?? 0,
        average: q.average ?? '',
      })),
    },
    {
      name: 'Question options',
      rows: (report?.questions ?? []).flatMap((q) => {
        if (q.options) {
          return q.options.map((o) => ({
            question: q.question,
            option: o.label,
            count: o.count,
            percentage: o.percentage !== undefined ? `${o.percentage}%` : '',
          }))
        }
        if (q.distribution) {
          return q.distribution.map((d) => ({
            question: q.question,
            option: `${d.rating} star${d.rating !== 1 ? 's' : ''}`,
            count: d.count,
            percentage: d.percentage !== undefined ? `${d.percentage}%` : '',
          }))
        }
        return []
      }),
    },
  ]
}

export function buildPollingReportCsvRows(report) {
  const rows = (report?.participationByProgram ?? []).map((row) => ({
    reportSection: 'Program participation',
    program: row.label,
    registered: row.registered,
    responded: row.responded,
    notResponded: row.notResponded,
    responseRate: row.responseRate,
  }))
  for (const q of report?.questions ?? []) {
    if (q.options) {
      for (const o of q.options) {
        rows.push({
          reportSection: 'Poll results',
          question: q.question,
          type: pollingQuestionTypeLabel(q.type),
          option: o.label,
          count: o.count,
          percentage: o.percentage,
        })
      }
    } else if (q.distribution) {
      for (const d of q.distribution) {
        rows.push({
          reportSection: 'Poll results',
          question: q.question,
          type: pollingQuestionTypeLabel(q.type),
          option: `${d.rating} stars`,
          count: d.count,
          percentage: d.percentage,
        })
      }
    } else {
      rows.push({
        reportSection: 'Poll results',
        question: q.question,
        type: pollingQuestionTypeLabel(q.type),
        option: '',
        count: q.responseCount ?? 0,
        percentage: '',
      })
    }
  }
  return rows
}

export function buildPollingExportPayload(report, { generatedAt } = {}) {
  const summary = report?.responseSummary ?? {}
  const participationRows = (report?.participationByProgram ?? []).map((row) => ({
    program: row.label,
    registered: row.registered,
    responded: row.responded,
    notResponded: row.notResponded,
    responseRate: `${row.responseRate}%`,
  }))
  return {
    title: report?.event?.title ?? 'Poll report',
    subtitle: 'Poll report — response charts',
    generatedAt: generatedAt ?? new Date().toISOString(),
    sections: [
      {
        title: 'Program participation',
        kind: 'table',
        columns: [
          { key: 'program', label: 'Program' },
          { key: 'registered', label: 'Registered' },
          { key: 'responded', label: 'Responded' },
          { key: 'notResponded', label: 'Not responded' },
          { key: 'responseRate', label: 'Response rate' },
        ],
        rows: participationRows,
      },
      {
        title: 'Response summary',
        kind: 'stats',
        stats: [
          { label: 'Mode', value: summary.pollAnonymous ? 'Anonymous' : 'Identified' },
          { label: 'Submissions', value: summary.totalSubmissions ?? 0 },
          { label: 'Enrolled', value: summary.enrolledRespondents ?? 0 },
          { label: 'Response rate', value: `${summary.responseRate ?? 0}%` },
        ],
      },
      ...(report?.questions ?? []).map((q) => {
        if (q.options) {
          return {
            title: q.question,
            description: `${pollingQuestionTypeLabel(q.type)} · ${q.responseCount ?? 0} answers`,
            kind: 'table',
            columns: [
              { key: 'option', label: 'Option' },
              { key: 'count', label: 'Count' },
              { key: 'percentage', label: '%' },
            ],
            rows: q.options.map((o) => ({
              option: o.label,
              count: o.count,
              percentage: o.percentage !== undefined ? `${o.percentage}%` : '',
            })),
          }
        }
        if (q.distribution) {
          return {
            title: q.question,
            description: `Rating · average ${q.average} / 5`,
            kind: 'table',
            columns: [
              { key: 'rating', label: 'Rating' },
              { key: 'count', label: 'Count' },
              { key: 'percentage', label: '%' },
            ],
            rows: q.distribution.map((d) => ({
              rating: `${d.rating} star${d.rating !== 1 ? 's' : ''}`,
              count: d.count,
              percentage: d.percentage !== undefined ? `${d.percentage}%` : '',
            })),
          }
        }
        return {
          title: q.question,
          description: `${pollingQuestionTypeLabel(q.type)} · ${q.responseCount ?? 0} answers`,
          kind: 'keyvalue',
          keyValue: (q.responses ?? []).slice(0, 50).map((r, idx) => ({
            key: `Response ${idx + 1}`,
            value: r.text,
          })),
        }
      }),
    ],
  }
}

export function buildPollingQuestionDistribution(analytics) {
  // Per-question distribution for the analytics dashboard.
  return (analytics?.questions ?? []).map((q) => {
    if (q.type === 'rating' && q.distribution) {
      return {
        id: q.questionId,
        name: q.question,
        value: Number(q.average ?? 0),
        sublabel: `Average ${Number(q.average ?? 0).toFixed(2)} / 5`,
        meta: q.distribution
          .map((d) => `${d.rating}★: ${d.count}`)
          .join(' · '),
      }
    }
    if (q.options) {
      const items = withPercentage(
        q.options.map((o) => ({ id: o.optionId, label: o.label, value: o.count ?? 0 })),
        'value',
      )
      return {
        id: q.questionId,
        name: q.question,
        sublabel: `${pollingQuestionTypeLabel(q.type)} · ${q.responseCount ?? 0} answers`,
        contestants: items,
      }
    }
    return {
      id: q.questionId,
      name: q.question,
      sublabel: `${pollingQuestionTypeLabel(q.type)} · ${q.responseCount ?? 0} answers`,
      responses: q.responses ?? [],
    }
  })
}

export function sumResponse(items) {
  return sumBy(items ?? [], 'count')
}
