import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function CompetitionJudgesPage() {
  const { eventId } = useParams()
  const [judges, setJudges] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [importResult, setImportResult] = useState(null)

  const load = useCallback(() => {
    pageantService
      .listJudges(eventId)
      .then(({ data }) => setJudges(data.judges ?? []))
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const invite = async (e) => {
    e.preventDefault()
    await pageantService.inviteJudge(eventId, { email, temporaryPassword })
    setEmail('')
    setTemporaryPassword('')
    load()
  }

  const onCsv = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const { data } = await pageantService.importJudgesCsv(eventId, file)
    setImportResult(data)
    load()
    e.target.value = ''
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-v-text">Judges</h2>
      <p className="text-sm text-v-text-subtle">Judges are voter accounts with scoring access for this competition scoring event.</p>

      <div className="v-card p-6">
        <p className="text-sm text-v-text-muted">CSV: email, tempassword</p>
        <input type="file" accept=".csv" className="mt-2 text-sm text-v-text-subtle" onChange={onCsv} />
        {importResult && (
          <p className="mt-2 text-sm text-v-success">
            Imported {importResult.succeeded}/{importResult.total} judges
          </p>
        )}
      </div>

      <form onSubmit={invite} className="flex gap-2">
        <input
          type="email"
          className="v-input flex-1"
          placeholder="judge@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="v-input flex-1"
          placeholder="Temp Password (min 8 chars)"
          value={temporaryPassword}
          onChange={(e) => setTemporaryPassword(e.target.value)}
          minLength={8}
          required
        />
        <button type="submit" className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white">
          Invite judge
        </button>
      </form>

      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-v-border text-v-text-subtle">
            <th className="py-2">Email</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {judges.map((j) => (
            <tr key={j.id} className="border-b border-v-border/50">
              <td className="py-3 text-v-text-muted">{j.email}</td>
              <td className={j.hasScored ? 'text-v-success' : 'text-v-text-subtle'}>
                {j.hasScored ? 'Submitted' : 'Pending'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
