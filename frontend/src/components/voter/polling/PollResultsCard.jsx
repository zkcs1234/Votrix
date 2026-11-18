import { BarChart2, Users } from 'lucide-react'
import Badge from '@/components/ui/Badge'

// Student-facing poll results. Totals only: the API never sends respondent
// identities or written-in answers, so this card has nothing sensitive to hide.

function Bar({ label, percentage, detail }) {
  const pct = Math.min(Math.max(Number(percentage) || 0, 0), 100)
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 break-words text-v-text">{label}</span>
        <span className="shrink-0 text-v-text-muted">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-v-surface-elevated" aria-hidden>
        <div className="h-full rounded-full bg-v-primary" style={{ width: `${pct}%` }} />
      </div>
    </li>
  )
}

function QuestionResult({ item }) {
  let body

  if (item.kind === 'choice') {
    body = (
      <ul className="space-y-3">
        {item.options.map((o) => (
          <Bar key={o.optionId} label={o.label} percentage={o.percentage} detail={`${o.count} · ${o.percentage}%`} />
        ))}
      </ul>
    )
  } else if (item.kind === 'numeric') {
    const max = Math.max(...item.distribution.map((d) => d.count), 1)
    body = (
      <div className="space-y-3">
        <p className="text-sm text-v-text-muted">
          Average: <span className="font-semibold text-v-text">{item.average}</span>
        </p>
        <ul className="space-y-3">
          {item.distribution.map((d) => (
            <Bar key={d.value} label={String(d.value)} percentage={(d.count / max) * 100} detail={`${d.count} · ${d.percentage}%`} />
          ))}
        </ul>
      </div>
    )
  } else if (item.kind === 'ranking') {
    body = (
      <ol className="space-y-2 text-sm">
        {[...item.options]
          .sort((a, b) => (a.averageRank ?? Infinity) - (b.averageRank ?? Infinity))
          .map((o, index) => (
            <li key={o.optionId} className="flex items-baseline justify-between gap-3">
              <span className="text-v-text">{index + 1}. {o.label}</span>
              <span className="shrink-0 text-v-text-muted">
                {o.averageRank == null ? 'No rankings' : `Avg. rank ${Math.round(o.averageRank * 100) / 100}`}
              </span>
            </li>
          ))}
      </ol>
    )
  } else {
    body = <p className="text-sm text-v-text-muted">{item.responseCount} response{item.responseCount === 1 ? '' : 's'}</p>
  }

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-v-text">{item.question}</h4>
        <p className="v-caption mt-0.5">{item.responseCount} response{item.responseCount === 1 ? '' : 's'}</p>
      </div>
      {body}
    </section>
  )
}

export default function PollResultsCard({ results, pollTitle }) {
  if (!results) return null
  const { event, totalSubmissions, enrolledRespondents, hiddenTextQuestions, questions } = results
  const live = event && event.final === false

  return (
    <div className="v-card overflow-hidden">
      <div className="border-b border-v-border bg-v-surface-elevated/50 px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <BarChart2 className="h-4 w-4 shrink-0 text-v-accent" strokeWidth={1.5} />
            <h3 className="truncate font-semibold text-v-text">{pollTitle ?? event?.title}</h3>
          </div>
          {live && <Badge tone="info">Live</Badge>}
        </div>
      </div>

      <div className="space-y-6 px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-v-text-muted">
          <Users className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          <span>
            {totalSubmissions ?? 0} response{totalSubmissions === 1 ? '' : 's'} from {enrolledRespondents ?? 0} enrolled
          </span>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-v-text-muted">There are no results to show for this poll.</p>
        ) : (
          questions.map((item) => <QuestionResult key={item.questionId} item={item} />)
        )}

        {hiddenTextQuestions > 0 && (
          <p className="v-caption">
            Written answers are not shown ({hiddenTextQuestions} question{hiddenTextQuestions === 1 ? '' : 's'}).
          </p>
        )}
      </div>
    </div>
  )
}
