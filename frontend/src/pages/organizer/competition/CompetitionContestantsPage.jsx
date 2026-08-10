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
  const [numberHint, setNumberHint] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [filterDivisionId, setFilterDivisionId] = useState('')
  const [editingContestant, setEditingContestant] = useState(null)
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

  const refreshNextNumber = useCallback(
    async (divId) => {
      try {
        const { data } = await pageantService.getNextContestantNumber(eventId, divId || null)
        setNumber(data.nextContestantNumber)
        setNumberHint(
          divId
            ? `Next available in this division`
            : `Next available number`,
        )
      } catch {
        setNumber(1)
        setNumberHint('')
      }
    },
    [eventId],
  )

  useEffect(() => {
    if (editingContestant) return
    if (!foundation) return
    refreshNextNumber(divisionId || null)
  }, [foundation, divisionId, editingContestant, refreshNextNumber])

  const handleCreate = async (e) => {
    e.preventDefault()
    const payload = {
      name,
      contestantNumber: Number(number),
      divisionId: divisionId || null,
    }
    const { data } = editingContestant
      ? await pageantService.updateContestant(eventId, editingContestant.id, payload)
      : await pageantService.createContestant(eventId, payload)
    if (photoFile && data.contestant?.id) {
      await pageantService.uploadContestantPhoto(eventId, data.contestant.id, photoFile)
    }
    setName('')
    setDivisionId('')
    setPhotoFile(null)
    setEditingContestant(null)
    setLoading(true)
    await load()
    await refreshNextNumber(divisionId || null)
  }

  const startEditing = (contestant) => {
    setEditingContestant(contestant)
    setName(contestant.name)
    setNumber(contestant.contestantNumber ?? contestant.contestant_number)
    setDivisionId(contestant.divisionId ?? contestant.division_id ?? '')
    setPhotoFile(null)
    setNumberHint('')
  }

  const cancelEdit = () => {
    setEditingContestant(null)
    setName('')
    setDivisionId('')
    setPhotoFile(null)
    setNumberHint('')
    refreshNextNumber(divisionId || null)
  }

  const visibleList = filterDivisionId
    ? list.filter((contestant) => (contestant.divisionId ?? contestant.division_id) === filterDivisionId)
    : list

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-v-text">Contestants</h2>
        {divisionsEnabled && divisions.length > 0 && (
          <select
            className={`${inputClass} w-auto`}
            value={filterDivisionId}
            onChange={(e) => setFilterDivisionId(e.target.value)}
            aria-label="Filter contestants by division"
          >
            <option value="">All divisions</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      </div>

      <form onSubmit={handleCreate} className="space-y-4 v-card p-6">
        <div className={`grid gap-4 ${divisionsEnabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <input className={inputClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <div className="space-y-1">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              disabled={Boolean(editingContestant)}
              aria-label="Contestant number"
            />
            {!editingContestant && numberHint && (
              <p className="text-xs text-v-text-subtle">{numberHint}</p>
            )}
          </div>
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
          {editingContestant ? 'Save contestant' : 'Add contestant'}
        </button>
        {editingContestant && (
          <button
            type="button"
            className="ml-3 text-sm text-v-text-muted hover:text-v-text"
            onClick={cancelEdit}
          >
            Cancel edit
          </button>
        )}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleList.map((c) => {
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
              <div className="mt-auto flex gap-3 pt-3 text-sm">
                <button type="button" className="text-v-primary" onClick={() => startEditing(c)}>Edit</button>
                <button
                  type="button"
                  className="text-v-danger"
                  onClick={async () => {
                    if (confirm('Delete?')) {
                      await pageantService.deleteContestant(eventId, c.id)
                      await load()
                      if (!editingContestant) {
                        await refreshNextNumber(divisionId || null)
                      }
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}
        {!visibleList.length && <p className="text-sm text-v-text-subtle">No contestants match this division.</p>}
      </div>
    </div>
  )
}
