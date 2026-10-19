import { useCallback, useEffect, useState } from 'react'
import { workflowService } from '@/services/competition-workflow.service'
import useCompetitionSync from '@/hooks/useCompetitionSync'
import useLatestRequest from '@/hooks/useLatestRequest'

// This endpoint returns the published overall snapshot only, with no worksheets
// or other judges' scores. Local/live totals never stand in for official results.
export default function CompetitionPublishedResults({ eventId, judgeId }) {
  const [publication, setPublication] = useState(null)
  const [error, setError] = useState('')
  const beginRequest = useLatestRequest(`${eventId}:${judgeId}`)
  const load = useCallback(async () => {
    const isCurrent = beginRequest()
    try {
      const { data } = await workflowService.getPublishedResults(eventId)
      if (isCurrent()) { setPublication(data); setError('') }
    } catch (e) {
      if (isCurrent()) setError(e.response?.data?.message ?? 'Published results could not be checked.')
    }
  }, [eventId, beginRequest])
  useEffect(() => { setPublication(null); void load() }, [load])
  useCompetitionSync(eventId, load)
  if (error) return <p role="alert" className="v-caption">{error} <button className="underline" type="button" onClick={load}>Retry results</button></p>
  if (!publication?.publishedAt || !publication.results?.length) return null
  return <section className="v-card p-5 space-y-3"><h2 className="v-section-title">Official published results</h2>
    <p className="v-caption">Published {new Date(publication.publishedAt).toLocaleString()} · {publication.method}</p>
    <div className="overflow-x-auto"><table className="v-table"><thead><tr><th>Rank</th><th>Contestant</th><th>Official result</th></tr></thead>
      <tbody>{publication.results.map(row => <tr key={row.contestantId}><td>{row.rank}</td><td>{row.contestantName}</td><td>{publication.method === 'manual' ? `Placement ${row.rank}` : row.finalScore ?? 'Incomplete'}</td></tr>)}</tbody>
    </table></div></section>
}
