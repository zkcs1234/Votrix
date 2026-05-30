import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageUploadField from '@/components/upload/ImageUploadField'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function ElectionCandidatesPage() {
  const { eventId } = useParams()
  const [positions, setPositions] = useState([])
  const [candidates, setCandidates] = useState([])
  const [positionId, setPositionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', description: '', partylist: '' })
  const [photoFile, setPhotoFile] = useState(null)

  const load = async () => {
    const [posRes, candRes] = await Promise.all([
      electionService.listPositions(eventId),
      electionService.listCandidates(eventId),
    ])
    setPositions(posRes.data.positions ?? [])
    setCandidates(candRes.data.candidates ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [eventId])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!positionId) return

    const { data } = await electionService.createCandidate(eventId, positionId, form)

    if (photoFile) {
      await electionService.uploadCandidatePhoto(eventId, data.candidate.id, photoFile)
    }

    setForm({ name: '', description: '', partylist: '' })
    setPhotoFile(null)
    setLoading(true)
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete candidate?')) return
    await electionService.deleteCandidate(eventId, id)
    load()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  const positionName = (id) => positions.find((p) => p.id === id)?.name ?? 'â€”'

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-v-text">Candidates</h2>

      <form
        onSubmit={handleCreate}
        className="space-y-4 v-card p-6"
      >
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Position</label>
          <select
            className={inputClass}
            value={positionId}
            onChange={(e) => setPositionId(e.target.value)}
            required
          >
            <option value="">Select position</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Name</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Partylist</label>
          <input
            className={inputClass}
            value={form.partylist}
            onChange={(e) => setForm({ ...form, partylist: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Description</label>
          <textarea
            className={inputClass}
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <ImageUploadField
          label="Candidate photo"
          variant="photo"
          onFileSelect={setPhotoFile}
        />
        <button type="submit" className="rounded-xl bg-v-primary px-4 py-2 text-sm text-white">
          Add candidate
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        {candidates.map((c) => (
          <div key={c.id} className="rounded-xl border border-v-border bg-v-surface p-4">
            {c.photo && (
              <img src={c.photo} alt="" className="mb-3 h-32 w-full rounded-lg object-cover" />
            )}
            <p className="font-medium text-v-text">{c.name}</p>
            <p className="text-xs text-v-text-muted">{positionName(c.positionId)}</p>
            {c.partylist && <p className="mt-1 text-sm text-v-text-subtle">{c.partylist}</p>}
            <button
              type="button"
              onClick={() => handleDelete(c.id)}
              className="mt-3 text-sm text-v-danger"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
