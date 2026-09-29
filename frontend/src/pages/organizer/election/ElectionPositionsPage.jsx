import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useToast } from '@/hooks/useToast'
import ManagementWorkspace from '@/components/ui/ManagementWorkspace'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import useEventStatus from '@/hooks/useEventStatus'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

export default function ElectionPositionsPage() {
  const { eventId } = useParams()
  const [positions, setPositions] = useState([])
  const [sections, setSections] = useState([])
  const [sectionId, setSectionId] = useState('')
  const [sectionName, setSectionName] = useState('')
  const [sectionSaving, setSectionSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [numberOfWinners, setNumberOfWinners] = useState(1)
  // minVote removed – default is 1 (no minimum constraint)
  const [maxVote, setMaxVote] = useState(1)
  const [displayOrder, setDisplayOrder] = useState('')
  const [saving, setSaving] = useState(false)
  const { success: showSuccess, error: showError } = useToast()
  const { status, setupLocked } = useEventStatus(electionService, eventId)

  const load = useCallback((selectedSectionId = sectionId) => {
    if (!selectedSectionId) return
    electionService
      .listPositions(eventId, selectedSectionId)
      .then(({ data }) => setPositions(data.positions ?? []))
      .finally(() => setLoading(false))
  }, [eventId, sectionId])

  useEffect(() => {
    electionService.listBallotSections(eventId).then(({ data }) => {
      const nextSections = data.sections ?? []
      setSections(nextSections)
      const selected = nextSections.find((section) => section.id === sectionId) ?? nextSections[0]
      setSectionId(selected?.id ?? '')
      if (selected) load(selected.id)
      else {
        setPositions([])
        setLoading(false)
      }
    })
  }, [eventId, sectionId, load])

  useEffect(() => {
    if (sectionId) load(sectionId)
  }, [eventId, sectionId, load])

  const resetForm = () => {
    setName('')
    setDescription('')
    setNumberOfWinners(1)
    // setMinVote removed – no longer needed
    setMaxVote(1)
    setDisplayOrder('')
  }

  const handleCreate = async (e) => {
    e.preventDefault()

    // No need to validate minVote vs maxVote now
    // Validation removed – minVote feature eliminated

    setSaving(true)
    try {
      await electionService.createPosition(eventId, {
        name,
        description: description || null,
        numberOfWinners: Number(numberOfWinners),
        maxVote: Number(maxVote),
        displayOrder: displayOrder === '' ? undefined : Number(displayOrder),
        allowSkip: false,
      }, sectionId)
      resetForm()
      setLoading(true)
      load()
      showSuccess(`Position "${name}" added`)
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to create position')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateSection = async (e) => {
    e.preventDefault()
    if (!sectionName.trim()) return
    setSectionSaving(true)
    try {
      const { data } = await electionService.createBallotSection(eventId, {
        name: sectionName.trim(),
        displayOrder: sections.length,
      })
      setSections((current) => [...current, data.section])
      setSectionId(data.section.id)
      setSectionName('')
      setPositions([])
      showSuccess(`Ballot section "${data.section.name}" added`)
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add ballot section')
    } finally {
      setSectionSaving(false)
    }
  }

  const handleMoveSection = async (section, delta) => {
    const index = sections.findIndex((item) => item.id === section.id)
    const target = index + delta
    if (target < 0 || target >= sections.length) return
    const other = sections[target]
    try {
      await Promise.all([
        electionService.updateBallotSection(eventId, section.id, { displayOrder: other.displayOrder }),
        electionService.updateBallotSection(eventId, other.id, { displayOrder: section.displayOrder }),
      ])
      setSections((current) => {
        const next = [...current]
        ;[next[index], next[target]] = [next[target], next[index]]
        return next.map((item, order) => ({ ...item, displayOrder: order }))
      })
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to reorder ballot sections')
    }
  }

  const handleRenameSection = async (section) => {
    const name = window.prompt('Ballot section name', section.name)?.trim()
    if (!name || name === section.name) return
    try {
      const { data } = await electionService.updateBallotSection(eventId, section.id, { name })
      setSections((current) => current.map((item) => item.id === section.id ? data.section : item))
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to rename ballot section')
    }
  }

  const handleDeleteSection = async (section) => {
    if (sections.length <= 1) {
      showError('An election must keep at least one ballot section')
      return
    }
    if (!confirm(`Delete "${section.name}" and its positions?`)) return
    try {
      await electionService.deleteBallotSection(eventId, section.id)
      const remaining = sections.filter((item) => item.id !== section.id)
      setSections(remaining)
      if (sectionId === section.id) setSectionId(remaining[0]?.id ?? '')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete ballot section')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this position and all its candidates?')) return
    try {
      await electionService.deletePosition(eventId, id)
      load()
      showSuccess('Position deleted')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete position')
    }
  }

  const handleMove = async (position, delta) => {
    const target = Math.max(0, (position.displayOrder ?? 0) + delta)
    try {
      await electionService.updatePosition(eventId, position.id, { displayOrder: target })
      load()
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to reorder position')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <ManagementWorkspace
      title="Position Builder"
      formPanel={
        <div className="space-y-4">
          <div className="v-card space-y-3 p-4">
            <label className="block text-sm text-v-text-muted" htmlFor="election-section">
              Ballot section
            </label>
            <select
              id="election-section"
              className={`${inputClass} w-full`}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>{section.name}</option>
              ))}
            </select>
            <ol className="space-y-1">
              {sections.map((section, index) => (
                <li key={section.id} className="flex items-center justify-between gap-2 text-sm">
                  <button type="button" className="truncate text-left text-v-text" onClick={() => setSectionId(section.id)}>
                    {index + 1}. {section.name}
                  </button>
                  {!setupLocked && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" disabled={index === 0} onClick={() => handleMoveSection(section, -1)} aria-label={`Move ${section.name} up`}>↑</button>
                      <button type="button" disabled={index === sections.length - 1} onClick={() => handleMoveSection(section, 1)} aria-label={`Move ${section.name} down`}>↓</button>
                      <button type="button" onClick={() => handleRenameSection(section)} className="text-xs text-v-primary">Rename</button>
                      <button type="button" onClick={() => handleDeleteSection(section)} className="text-xs text-v-danger">Delete</button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {!setupLocked && (
              <form onSubmit={handleCreateSection} className="flex gap-2 border-t border-v-border pt-3">
                <input
                  className={`${inputClass} min-w-0 flex-1`}
                  placeholder="New ballot section"
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  required
                />
                <button type="submit" disabled={sectionSaving} className="rounded-md bg-v-primary px-3 py-2 text-sm text-white disabled:opacity-50">
                  {sectionSaving ? 'Adding...' : 'Add'}
                </button>
              </form>
            )}
          </div>
          {setupLocked ? (
            <ReadOnlyEventBanner status={status} noun="election" />
          ) : (
        <form
          onSubmit={handleCreate}
          className="grid gap-4 v-card p-6 sm:grid-cols-2 mb-4"
        >
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-v-text-muted">Position name</label>
          <input
            className={`${inputClass} w-full`}
            placeholder="e.g. President"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm text-v-text-muted">Description</label>
          <textarea
            className={`${inputClass} w-full`}
            rows={2}
            placeholder="Optional description shown on the ballot"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Number of winners</label>
          <input
            type="number"
            min={1}
            className={`${inputClass} w-full`}
            value={numberOfWinners}
            onChange={(e) => setNumberOfWinners(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Max votes</label>
          <input
            type="number"
            min={1}
            className={`${inputClass} w-full`}
            value={maxVote}
            onChange={(e) => setMaxVote(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Display order</label>
          <input
            type="number"
            min={0}
            className={`${inputClass} w-full`}
            placeholder="Auto"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover disabled:opacity-50 sm:col-span-2"
        >
          {saving ? 'Adding...' : 'Add position'}
        </button>
      </form>
          )}
        </div>
      }
      recordsPanel={
        <ul className="space-y-3 pb-8">
          {positions.map((p, idx) => (
          <li
            key={p.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-v-border bg-v-surface px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-v-text">
                <span className="mr-2 text-v-text-subtle">#{p.displayOrder ?? idx}</span>
                {p.name}
              </p>
              {p.description && (
                <p className="mt-1 text-xs text-v-text-subtle">{p.description}</p>
              )}
              <p className="mt-1 text-xs text-v-text-subtle">
                Winners: {p.numberOfWinners ?? 1} · Vote up to {p.maxVote}
              </p>
            </div>
            {!setupLocked && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleMove(p, -1)}
                className="rounded-lg border border-v-border px-2 py-1 text-xs text-v-text-muted hover:border-v-border-strong"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => handleMove(p, 1)}
                className="rounded-lg border border-v-border px-2 py-1 text-xs text-v-text-muted hover:border-v-border-strong"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="text-sm text-v-danger hover:text-v-danger"
              >
                Delete
              </button>
            </div>
            )}
          </li>
        ))}
      </ul>
      }
    />
  )
}
