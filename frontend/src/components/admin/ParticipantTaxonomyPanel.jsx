import { useEffect, useState } from 'react'
import { ListChecks, Plus, X, Save, GraduationCap, Users } from 'lucide-react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import FormAlert from '@/components/ui/FormAlert'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

// Phase 2 of VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md (decision D13).
// Admin maintains the canonical lists of valid Programs and Year & Sections.
// Later phases validate CSV imports and power the organizer cohort picker
// against these lists.

// Case-insensitive membership check so "BSIT" and "bsit" don't both get added.
function includesCI(list, value) {
  const key = value.trim().toLowerCase()
  return list.some((item) => item.toLowerCase() === key)
}

function EditableList({ title, icon: Icon, items, placeholder, onAdd, onRemove }) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const value = draft.trim()
    if (!value) return
    onAdd(value)
    setDraft('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
  }

  return (
    <section className="rounded-2xl border border-v-border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
        <h3 className="v-section-title">{title}</h3>
        <span className="v-caption ml-auto">{items.length}</span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={INPUT_CLASS}
        />
        <Button type="button" variant="secondary" onClick={commit} disabled={!draft.trim()}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="v-caption mt-3">None added yet.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1 rounded-lg border border-v-border bg-v-surface-elevated px-2.5 py-1 text-sm text-v-text"
            >
              {item}
              <button
                type="button"
                onClick={() => onRemove(item)}
                className="text-v-text-subtle hover:text-v-danger"
                aria-label={`Remove ${item}`}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function ParticipantTaxonomyPanel() {
  const [programs, setPrograms] = useState([])
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { success, error: toastError } = useToast()

  useEffect(() => {
    let alive = true
    setLoading(true)
    adminService
      .getParticipantTaxonomy()
      .then(({ data }) => {
        if (!alive) return
        setPrograms(data.taxonomy?.programs ?? [])
        setSections(data.taxonomy?.sections ?? [])
        setError(null)
      })
      .catch(() => {
        if (alive) setError('Failed to load participant taxonomy')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const addProgram = (value) => {
    if (includesCI(programs, value)) return
    setPrograms((current) => [...current, value.trim()])
  }
  const addSection = (value) => {
    if (includesCI(sections, value)) return
    setSections((current) => [...current, value.trim()])
  }
  const removeProgram = (value) => setPrograms((current) => current.filter((p) => p !== value))
  const removeSection = (value) => setSections((current) => current.filter((s) => s !== value))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const { data } = await adminService.updateParticipantTaxonomy({ programs, sections })
      setPrograms(data.taxonomy?.programs ?? [])
      setSections(data.taxonomy?.sections ?? [])
      success('Taxonomy saved')
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to save taxonomy')
      setError(message)
      toastError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-4 p-6">
          <div className="h-6 w-56 animate-pulse rounded-lg bg-v-surface-elevated" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-40 animate-pulse rounded-xl bg-v-surface-elevated" />
            <div className="h-40 animate-pulse rounded-xl bg-v-surface-elevated" />
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
          <div>
            <h2 className="v-section-title">Participant taxonomy</h2>
            <p className="v-caption mt-1">
              Valid Programs and Year &amp; Sections used to validate voter imports and to build the
              organizer&apos;s cohort invite picker.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <EditableList
            title="Programs"
            icon={GraduationCap}
            items={programs}
            placeholder="e.g. BSIT"
            onAdd={addProgram}
            onRemove={removeProgram}
          />
          <EditableList
            title="Year & Sections"
            icon={Users}
            items={sections}
            placeholder="e.g. 3-A"
            onAdd={addSection}
            onRemove={removeSection}
          />
        </div>

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <div className="flex justify-end border-t border-v-border pt-4">
          <Button type="button" onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
            Save taxonomy
          </Button>
        </div>
      </div>
    </Card>
  )
}
