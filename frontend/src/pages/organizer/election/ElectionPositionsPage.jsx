import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [groupsLoading, setGroupsLoading] = useState(true)
  const positionRequest = useRef(0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [numberOfWinners, setNumberOfWinners] = useState(1)
  // minVote removed – default is 1 (no minimum constraint)
  const [maxVote, setMaxVote] = useState(1)
  const [displayOrder, setDisplayOrder] = useState('')
  const [programs, setPrograms] = useState([])
  const [eligibilityMode, setEligibilityMode] = useState('all')
  const [selectedPrograms, setSelectedPrograms] = useState([])
  const [eligibilityDrafts, setEligibilityDrafts] = useState({})
  const [eligibilityModes, setEligibilityModes] = useState({})
  const [savingEligibility, setSavingEligibility] = useState('')
  const [saving, setSaving] = useState(false)
  const { success: showSuccess, error: showError } = useToast()
  const { status, setupLocked } = useEventStatus(electionService, eventId)

  const load = useCallback((selectedSectionId = sectionId) => {
    const request = ++positionRequest.current
    setPositions([])
    if (!selectedSectionId) { setLoading(false); return }
    setLoading(true)
    electionService
      .listPositions(eventId, selectedSectionId)
      .then(({ data }) => { if (request === positionRequest.current) setPositions(data.positions ?? []) })
      .catch((err) => showError(err.response?.data?.message || 'Failed to load positions'))
      .finally(() => { if (request === positionRequest.current) setLoading(false) })
  }, [eventId, sectionId, showError])

  useEffect(() => {
    setGroupsLoading(true)
    electionService.getCohorts(eventId).then(({ data }) => {
      setPrograms((data.programs ?? []).map((program) => program.value))
    }).catch((err) => showError(err.response?.data?.message || 'Failed to load voter programs'))
    electionService.listBallotSections(eventId).then(({ data }) => {
      const nextSections = data.sections ?? []
      setSections(nextSections)
      const selected = nextSections[0]
      setSectionId(selected?.id ?? '')
      setLoading(false)
    }).catch((err) => { showError(err.response?.data?.message || 'Failed to load election groups'); setLoading(false) })
      .finally(() => setGroupsLoading(false))
  }, [eventId, showError])

  useEffect(() => {
    load(sectionId)
  }, [eventId, sectionId, load])

  const resetForm = () => {
    setName('')
    setDescription('')
    setNumberOfWinners(1)
    // setMinVote removed – no longer needed
    setMaxVote(1)
    setDisplayOrder('')
    setEligibilityMode('all')
    setSelectedPrograms([])
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!sectionId) { showError('Select an election group before adding a position'); return }
    if (eligibilityMode === 'programs' && !selectedPrograms.length) {
      showError('Select at least one program or allow all voters in the group')
      return
    }

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
        eligiblePrograms: eligibilityMode === 'programs' ? selectedPrograms : [],
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
    if (!sectionName.trim()) { showError('Election group name is required'); return }
    if (sections.some((section) => section.name.trim().toLowerCase() === sectionName.trim().toLowerCase())) {
      showError('An election group with this name already exists'); return
    }
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
      showSuccess(`Election group "${data.section.name}" added`)
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to add election group')
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
        return next.map((item) => item.id === section.id ? { ...item, displayOrder: other.displayOrder } : item.id === other.id ? { ...item, displayOrder: section.displayOrder } : item)
      })
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to reorder election groups')
    }
  }

  const handleRenameSection = async (section) => {
    const entered = window.prompt('Election group name', section.name)
    if (entered === null) return
    const name = entered.trim()
    if (!name) { showError('Election group name is required'); return }
    if (name === section.name) return
    if (sections.some((item) => item.id !== section.id && item.name.trim().toLowerCase() === name.toLowerCase())) {
      showError('An election group with this name already exists'); return
    }
    try {
      const { data } = await electionService.updateBallotSection(eventId, section.id, { name })
      setSections((current) => current.map((item) => item.id === section.id ? data.section : item))
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to rename election group')
    }
  }

  const handleDeleteSection = async (section) => {
    if (!confirm(`Delete "${section.name}" and its positions?`)) return
    try {
      await electionService.deleteBallotSection(eventId, section.id)
      const remaining = sections.filter((item) => item.id !== section.id)
      setSections(remaining)
      if (sectionId === section.id) setSectionId(remaining[0]?.id ?? '')
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to delete election group')
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

  const handleSaveEligibility = async (position) => {
    const mode = eligibilityModes[position.id] ?? (position.eligiblePrograms?.length ? 'programs' : 'all')
    const eligiblePrograms = mode === 'all' ? [] : eligibilityDrafts[position.id] ?? position.eligiblePrograms ?? []
    if (mode === 'programs' && !eligiblePrograms.length) {
      showError('Select at least one program or choose all programs')
      return
    }
    setSavingEligibility(position.id)
    try {
      const { data } = await electionService.updatePosition(eventId, position.id, { eligiblePrograms })
      setPositions((current) => current.map((item) => item.id === position.id ? data.position : item))
      setEligibilityDrafts((current) => ({ ...current, [position.id]: data.position.eligiblePrograms ?? [] }))
      setEligibilityModes((current) => ({
        ...current,
        [position.id]: data.position.eligiblePrograms?.length ? 'programs' : 'all',
      }))
      showSuccess(`Eligibility updated for "${position.name}"`)
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to update position eligibility')
    } finally {
      setSavingEligibility('')
    }
  }

  if (loading || groupsLoading) {
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
            <h3 className="v-section-title">Election Groups</h3>
            {!sections.length && <p className="v-caption">No election groups created yet. Create your first election group to start adding positions.</p>}
            <label className="block text-sm text-v-text-muted" htmlFor="election-section">
              Select Election Group
            </label>
            <select
              id="election-section"
              className={`${inputClass} w-full`}
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
            >
              <option value="">Select an election group</option>
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
              <form onSubmit={handleCreateSection} className="flex flex-col gap-2 border-t border-v-border pt-3">
                <input
                  className={`${inputClass} min-w-0 flex-1`}
                  placeholder="Enter election group name (e.g., SSG Election)"
                  aria-label="Election group name"
                  maxLength={255}
                  value={sectionName}
                  onChange={(e) => setSectionName(e.target.value)}
                  required
                />
                <button type="submit" disabled={sectionSaving} className="rounded-md bg-v-primary px-3 py-2 text-sm text-white disabled:opacity-50">
                  {sectionSaving ? 'Adding...' : '+ Add Election Group'}
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
        <fieldset disabled={!sectionId || saving} className="contents">
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
          <label className="mb-1 block text-sm text-v-text-muted">Maximum Selections</label>
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

        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="mb-1 block text-sm text-v-text-muted">Who can vote for this position?</legend>
          <label className="flex items-center gap-2 text-sm text-v-text">
            <input type="radio" name="position-eligibility" checked={eligibilityMode === 'all'} onChange={() => setEligibilityMode('all')} />
            All programs eligible for this group
          </label>
          <label className="flex items-center gap-2 text-sm text-v-text">
            <input type="radio" name="position-eligibility" checked={eligibilityMode === 'programs'} onChange={() => setEligibilityMode('programs')} />
            Only selected programs
          </label>
          {eligibilityMode === 'programs' && (
            <div className="grid gap-2 rounded-lg border border-v-border p-3 sm:grid-cols-2">
              {!programs.length && <p className="v-caption sm:col-span-2">No voter programs are available in your organizer scope.</p>}
              {programs.map((program) => (
                <label key={program} className="flex items-center gap-2 text-sm text-v-text">
                  <input
                    type="checkbox"
                    checked={selectedPrograms.includes(program)}
                    onChange={(event) => setSelectedPrograms((current) => event.target.checked
                      ? [...current, program]
                      : current.filter((value) => value !== program))}
                  />
                  {program}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <button
          type="submit"
          disabled={saving || !sectionId}
          className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover disabled:opacity-50 sm:col-span-2"
        >
          {saving ? 'Adding...' : 'Add position'}
        </button>
        </fieldset>
      </form>
          )}
        </div>
      }
      recordsPanel={
        <ul className="space-y-3 pb-8">
          {!positions.length && <li className="v-caption">{sectionId ? 'No positions in this election group yet.' : 'Select an election group to view its positions.'}</li>}
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
              <p className="mt-1 text-xs text-v-text-subtle">
                Eligible programs: {p.eligiblePrograms?.length
                  ? p.eligiblePrograms.length === 1 ? `${p.eligiblePrograms[0]} only` : p.eligiblePrograms.join(', ')
                  : 'All programs (group eligibility applies)'}
              </p>
              {!setupLocked && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-v-primary">Edit program eligibility</summary>
                  <div className="mt-2 space-y-2 rounded-lg border border-v-border p-3">
                    <label className="flex items-center gap-2 text-sm text-v-text">
                      <input
                        type="radio"
                        name={`position-eligibility-${p.id}`}
                        checked={(eligibilityModes[p.id] ?? (p.eligiblePrograms?.length ? 'programs' : 'all')) === 'all'}
                        onChange={() => {
                          setEligibilityModes((current) => ({ ...current, [p.id]: 'all' }))
                          setEligibilityDrafts((current) => ({ ...current, [p.id]: [] }))
                        }}
                      />
                      All programs eligible for this group
                    </label>
                    <label className="flex items-center gap-2 text-sm text-v-text">
                      <input
                        type="radio"
                        name={`position-eligibility-${p.id}`}
                        checked={(eligibilityModes[p.id] ?? (p.eligiblePrograms?.length ? 'programs' : 'all')) === 'programs'}
                        onChange={() => setEligibilityModes((current) => ({ ...current, [p.id]: 'programs' }))}
                      />
                      Only selected programs
                    </label>
                    {(eligibilityModes[p.id] ?? (p.eligiblePrograms?.length ? 'programs' : 'all')) === 'programs' && (
                      <div className="grid gap-2 rounded-md border border-v-border p-3 sm:grid-cols-2">
                        {[...new Set([...programs, ...(p.eligiblePrograms ?? [])])].map((program) => {
                          const selected = eligibilityDrafts[p.id] ?? p.eligiblePrograms ?? []
                          return (
                            <label key={program} className="flex items-center gap-2 text-sm text-v-text">
                              <input
                                type="checkbox"
                                checked={selected.includes(program)}
                                onChange={(event) => setEligibilityDrafts((current) => {
                                  const previous = current[p.id] ?? p.eligiblePrograms ?? []
                                  return {
                                    ...current,
                                    [p.id]: event.target.checked
                                      ? [...previous, program]
                                      : previous.filter((value) => value !== program),
                                  }
                                })}
                              />
                              {program}
                            </label>
                          )
                        })}
                        {!programs.length && <p className="v-caption sm:col-span-2">No voter programs are available in your organizer scope.</p>}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={savingEligibility === p.id}
                      onClick={() => handleSaveEligibility(p)}
                      className="rounded-md bg-v-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      {savingEligibility === p.id ? 'Saving...' : 'Save eligibility'}
                    </button>
                  </div>
                </details>
              )}
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
