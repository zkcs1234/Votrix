import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import Button from '@/components/ui/Button'
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

      <div className="grid gap-6">
        <div className="v-card-sm">
          <h3 className="v-label">CSV upload</h3>
          <p className="v-helper-text mb-3">
            Columns: email (required), tempassword (optional).
            <br />
            If tempassword provided: Creates new judge with that password.
            <br />
            If tempassword empty: Enrolls existing judge only.
          </p>
          <input type="file" accept=".csv" className="v-caption" onChange={onCsv} />
          {importResult && (
            <p className="v-caption mt-2 text-v-success">
              Imported {importResult.succeeded} of {importResult.total} — invitation emails sent.
            </p>
          )}
        </div>

        <div className="v-card-sm">
          <h3 className="v-label mb-3">Invite Manually</h3>
          <form onSubmit={invite} className="flex flex-wrap gap-3">
            <input
              type="email"
              className="v-input flex-1 min-w-[200px]"
              placeholder="New judge (email)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="v-input flex-1 min-w-[200px]"
              placeholder="Temp Password (min 8 chars)"
              value={temporaryPassword}
              onChange={(e) => setTemporaryPassword(e.target.value)}
              minLength={8}
              required
            />
            <Button type="submit">
              Invite Judge
            </Button>
          </form>
        </div>
      </div>

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
