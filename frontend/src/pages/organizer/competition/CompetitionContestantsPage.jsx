import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pageantService } from '@/services/pageant.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import ImageUploadField from '@/components/upload/ImageUploadField'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function CompetitionContestantsPage() {
  const { eventId } = useParams()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [number, setNumber] = useState(1)
  const [photoFile, setPhotoFile] = useState(null)

  const load = useCallback(() => {
    pageantService
      .listContestants(eventId)
      .then(({ data }) => setList(data.contestants ?? []))
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async (e) => {
    e.preventDefault()
    const { data } = await pageantService.createContestant(eventId, {
      name,
      contestantNumber: Number(number),
    })
    if (photoFile) {
      await pageantService.uploadContestantPhoto(eventId, data.contestant.id, photoFile)
    }
    setName('')
    setPhotoFile(null)
    setLoading(true)
    load()
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
      <h2 className="text-xl font-semibold text-v-text">Contestants</h2>

      <form onSubmit={handleCreate} className="space-y-4 v-card p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <input className={inputClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input type="number" min={1} className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <ImageUploadField label="Contestant photo" variant="photo" onFileSelect={setPhotoFile} />
        <button type="submit" className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white">
          Add contestant
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <div key={c.id} className="rounded-xl border border-v-border bg-v-surface p-4">
            {c.photo && <img src={c.photo} alt="" className="mb-3 h-40 w-full rounded-lg object-cover" />}
            <p className="text-v-text-muted text-xs">#{c.contestantNumber}</p>
            <p className="font-medium text-v-text">{c.name}</p>
            <button
              type="button"
              className="mt-2 text-sm text-v-danger"
              onClick={async () => {
                if (confirm('Delete?')) {
                  await pageantService.deleteContestant(eventId, c.id)
                  load()
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
