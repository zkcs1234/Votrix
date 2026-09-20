import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { electionService } from '@/services/election.service'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import ImageUploadField from '@/components/upload/ImageUploadField'
import FilterBar from '@/components/ui/FilterBar'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { useToast } from '@/hooks/useToast'
import ManagementWorkspace from '@/components/ui/ManagementWorkspace'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import useEventStatus from '@/hooks/useEventStatus'
import useTableFilter from '@/hooks/useTableFilter'

import { INPUT_CLASS } from '@/utils/uiClasses'
const inputClass = INPUT_CLASS

function CandidateCard({ candidate, positionName, onDelete, canDelete = true }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Delete candidate?')) return
    setDeleting(true)
    try {
      await onDelete(candidate.id)
    } finally {
      setDeleting(false)
    }
  }

  // Prefer the new `party` field but fall back to legacy `partylist`.
  const party = candidate.party ?? candidate.partylist

  return (
    <div className="rounded-xl border border-v-border bg-v-surface p-4">
      {candidate.photo && (
        <img
          src={candidate.photo}
          alt=""
          className="mb-3 h-32 w-full rounded-lg object-cover"
        />
      )}
      <p className="font-medium text-v-text">{candidate.name}</p>
      <p className="text-xs text-v-text-muted">{positionName}</p>
      {party && <p className="mt-1 text-sm text-v-text-subtle">{party}</p>}
      {candidate.biography && (
        <p className="mt-2 line-clamp-3 text-xs text-v-text-subtle">
          <span className="font-medium text-v-text-muted">Bio:</span> {candidate.biography}
        </p>
      )}
      {candidate.platform && (
        <p className="mt-1 line-clamp-3 text-xs text-v-text-subtle">
          <span className="font-medium text-v-text-muted">Platform:</span> {candidate.platform}
        </p>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="mt-3 text-sm text-v-danger disabled:opacity-50"
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      )}
    </div>
  )
}

function CandidateFormSkeleton() {
  return (
    <div className="space-y-4 v-card p-6">
      <div className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-16 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-20 animate-pulse rounded-lg bg-v-surface-elevated" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-v-surface-elevated" />
      </div>
      <div className="h-10 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
    </div>
  )
}

const EMPTY_FORM = { name: '', biography: '', platform: '', party: '' }

function ElectionCandidatesPageContent() {
  const { eventId } = useParams()
  const [positions, setPositions] = useState([])
  const [candidates, setCandidates] = useState([])
  const [positionId, setPositionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [photoFile, setPhotoFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const { success: showSuccess, error: showError } = useToast()
  const { status, setupLocked } = useEventStatus(electionService, eventId)

  const positionNameOf = (c) => positions.find((p) => p.id === c.positionId)?.name ?? ''
  const {
    search,
    setSearch,
    activeFilters,
    setFilter,
    clearFilters,
    filtered: filteredCandidates,
    facets,
    resultCount,
    totalCount,
    hasActiveFilters,
  } = useTableFilter({
    rows: candidates,
    searchKeys: ['name', (c) => c.party ?? c.partylist, positionNameOf],
    facetFields: [{ id: 'position', label: 'Position', accessor: positionNameOf }],
  })

  const showLoader = useDelayedLoading(loading, 300)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [posRes, candRes] = await Promise.all([
        electionService.listPositions(eventId),
        electionService.listCandidates(eventId),
      ])
      setPositions(posRes.data.positions ?? [])
      setCandidates(candRes.data.candidates ?? [])
    } catch (err) {
      console.error('Failed to load candidates:', err)
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    // Async fetch-on-mount pattern: setState happens inside the
    // Promise resolution, not synchronously with the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Optimistic UI - add candidate immediately
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!positionId) return

    setSaving(true)

    const tempId = `temp-${Date.now()}`
    const newCandidate = {
      id: tempId,
      name: form.name,
      biography: form.biography,
      platform: form.platform,
      party: form.party,
      partylist: form.party,
      positionId,
      photo: null,
    }
    setCandidates((prev) => [...prev, newCandidate])

    try {
      const { data } = await electionService.createCandidate(eventId, positionId, form)

      if (photoFile) {
        await electionService.uploadCandidatePhoto(eventId, data.candidate.id, photoFile)
      }

      load()

      setForm(EMPTY_FORM)
      setPhotoFile(null)
      showSuccess(`${form.name} added`)
    } catch (err) {
      setCandidates((prev) => prev.filter((c) => c.id !== tempId))
      showError(err.response?.data?.message || 'Failed to create candidate')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    const previousCandidates = [...candidates]
    setCandidates((prev) => prev.filter((c) => c.id !== id))

    try {
      await electionService.deleteCandidate(eventId, id)
      showSuccess('Candidate removed')
    } catch (err) {
      setCandidates(previousCandidates)
      showError(err.response?.data?.message || 'Failed to delete candidate')
    }
  }

  const positionName = (id) => positions.find((p) => p.id === id)?.name ?? '—'

  if (loading && !showLoader) {
    return null
  }

  if (loading || showLoader) {
    return (
      <div className="space-y-8">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-v-surface-elevated" />
        <CandidateFormSkeleton />
        <SkeletonGrid count={6} />
      </div>
    )
  }

  return (
    <ManagementWorkspace
      title="Candidate Management"
      formPanel={
        setupLocked ? (
          <ReadOnlyEventBanner status={status} noun="election" />
        ) : (
        <form onSubmit={handleCreate} className="space-y-4 v-card p-6 mb-4">
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
          <label className="mb-1 block text-sm text-v-text-muted">Party</label>
          <input
            className={inputClass}
            placeholder="e.g. Independent"
            value={form.party}
            onChange={(e) => setForm({ ...form, party: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Biography</label>
          <textarea
            className={inputClass}
            rows={3}
            value={form.biography}
            onChange={(e) => setForm({ ...form, biography: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-v-text-muted">Platform</label>
          <textarea
            className={inputClass}
            rows={3}
            value={form.platform}
            onChange={(e) => setForm({ ...form, platform: e.target.value })}
          />
        </div>
        <ImageUploadField
          label="Candidate photo"
          variant="photo"
          onFileSelect={setPhotoFile}
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add candidate'}
        </button>
      </form>
        )
      }
      recordsPanel={
        <div className="space-y-4 pb-8">
          {/* Search & filter bar */}
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search candidates by name, party, or position…"
            facetFields={[{ id: 'position', label: 'Position' }]}
            facets={facets}
            activeFilters={activeFilters}
            onFilterChange={setFilter}
            onClear={clearFilters}
            hasActiveFilters={hasActiveFilters}
            resultCount={resultCount}
            totalCount={totalCount}
            noun="candidates"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {filteredCandidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                positionName={positionName(c.positionId)}
                onDelete={handleDelete}
                canDelete={!setupLocked}
              />
            ))}
          </div>

          {!filteredCandidates.length && (
            <p className="text-center text-v-text-subtle">
              {hasActiveFilters ? 'No candidates match your filters.' : 'No candidates yet.'}
            </p>
          )}
        </div>
      }
    />
  )
}

export default function ElectionCandidatesPage() {
  return (
    <ElectionCandidatesPageContent />
  )
}

