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
  const [foundation, setFoundation] = useState(null)
  const [loading, setLoading] = useState(true)
  
  const [name, setName] = useState('')
  const [number, setNumber] = useState(1)
  const [divisionId, setDivisionId] = useState('')
  const [photoFile, setPhotoFile] = useState(null)

  const load = useCallback(() => {
    pageantService
      .getFoundation(eventId)
      .then(({ data }) => {
        setFoundation(data.foundation)
        setList(data.foundation.contestants ?? [])
      })
      .finally(() => setLoading(false))
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  const divisionsEnabled = foundation?.event?.divisions_enabled
  const divisions = foundation?.divisions ?? []

  const handleCreate = async (e) => {
    e.preventDefault()
    const { data } = await pageantService.createContestant(eventId, {
      name,
      contestantNumber: Number(number),
      divisionId: divisionId || null,
    })
    if (photoFile) {
      await pageantService.uploadContestantPhoto(eventId, data.contestant.id, photoFile)
    }
    setName('')
    setDivisionId('')
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
        <div className={`grid gap-4 ${divisionsEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <input className={inputClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input type="number" min={1} className={inputClass} value={number} onChange={(e) => setNumber(e.target.value)} />
          {divisionsEnabled && (
            <select
              className={inputClass}
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
            >
              <option value="">— Event-wide —</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <ImageUploadField label="Contestant photo" variant="photo" onFileSelect={setPhotoFile} />
        <button type="submit" className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white">
          Add contestant
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          // Both DB raw rows (snake_case) or mapped could be present depending on endpoints. 
          // getFoundation returns mapped rows for contestants.
          const currentDivisionId = c.divisionId ?? c.division_id
          const currentContestantNumber = c.contestantNumber ?? c.contestant_number
          const divisionName = currentDivisionId ? divisions.find(d => d.id === currentDivisionId)?.name : null

          return (
            <div key={c.id} className="rounded-xl border border-v-border bg-v-surface p-4 flex flex-col">
              {c.photo && <img src={c.photo} alt="" className="mb-3 h-40 w-full rounded-lg object-cover" />}
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="text-v-text-muted text-xs">#{currentContestantNumber}</p>
                  <p className="font-medium text-v-text">{c.name}</p>
                </div>
                {divisionsEnabled && divisionName && (
                  <span className="rounded-full bg-v-primary/10 px-2 py-0.5 text-[10px] font-medium text-v-primary uppercase tracking-wide">
                    {divisionName}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="mt-auto pt-2 text-sm text-v-danger text-left self-start"
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
          )
        })}
      </div>
    </div>
  )
}
