import { useEffect } from 'react'
import FormField from '@/components/ui/FormField'
import { useLiveForm } from '@/hooks/useLiveForm'
import { positionSchema, POSITION_DEFAULTS } from '@/schemas/election-builder.schemas'

/**
 * "Add position" form for the election position builder. Errors show as the
 * organizer types (instead of a toast after pressing Add), and the button says
 * why it is unavailable.
 *
 * `onCreate(payload)` performs the request and resolves to true on success (the
 * form then clears itself); the page keeps its own toast handling for server
 * failures.
 */
export default function PositionForm({
  sectionId,
  saving,
  canManageEligibility,
  programs,
  onCreate,
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
    blockedReason,
    canSubmit,
  } = useLiveForm({ schema: positionSchema, defaultValues: POSITION_DEFAULTS })

  const eligibilityMode = watch('eligibilityMode')
  const selectedPrograms = watch('selectedPrograms') ?? []

  // Switching to another election group starts a fresh position.
  useEffect(() => {
    reset(POSITION_DEFAULTS)
  }, [sectionId, reset])

  const toggleProgram = (program, checked) =>
    setValue(
      'selectedPrograms',
      checked ? [...selectedPrograms, program] : selectedPrograms.filter((value) => value !== program),
      { shouldValidate: true, shouldDirty: true, shouldTouch: true },
    )

  const onSubmit = async (values) => {
    const ok = await onCreate({
      name: values.name,
      description: values.description.trim() || null,
      numberOfWinners: Number(values.numberOfWinners),
      maxVote: Number(values.maxVote),
      displayOrder: values.displayOrder === '' ? undefined : Number(values.displayOrder),
      allowSkip: false,
      eligiblePrograms: values.eligibilityMode === 'programs' ? values.selectedPrograms : [],
    })
    if (ok) reset(POSITION_DEFAULTS)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 v-card p-6 sm:grid-cols-2 mb-4" noValidate>
      <fieldset disabled={!sectionId || saving} className="contents">
        <FormField label="Position name" required error={errors.name?.message} className="sm:col-span-2">
          {(field) => <input placeholder="e.g. President" {...field} {...register('name')} />}
        </FormField>

        <FormField label="Description" error={errors.description?.message} className="sm:col-span-2">
          {(field) => (
            <textarea
              rows={2}
              placeholder="Optional description shown on the ballot"
              {...field}
              {...register('description')}
            />
          )}
        </FormField>

        <FormField label="Number of winners" required error={errors.numberOfWinners?.message}>
          {(field) => <input type="number" min={1} {...field} {...register('numberOfWinners')} />}
        </FormField>

        <FormField label="Maximum Selections" required error={errors.maxVote?.message}>
          {(field) => <input type="number" min={1} {...field} {...register('maxVote')} />}
        </FormField>

        <FormField label="Display order" error={errors.displayOrder?.message} hint="Leave blank to add at the end.">
          {(field) => <input type="number" min={0} placeholder="Auto" {...field} {...register('displayOrder')} />}
        </FormField>

        {canManageEligibility && (
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="mb-1 block text-sm text-v-text-muted">Who can vote for this position?</legend>
            <label className="flex items-center gap-2 text-sm text-v-text">
              <input type="radio" value="all" {...register('eligibilityMode')} />
              All programs eligible for this group
            </label>
            <label className="flex items-center gap-2 text-sm text-v-text">
              <input type="radio" value="programs" {...register('eligibilityMode')} />
              Only selected programs
            </label>
            {eligibilityMode === 'programs' && (
              <div className="grid gap-2 rounded-lg border border-v-border p-3 sm:grid-cols-2">
                {!programs.length && (
                  <p className="v-caption sm:col-span-2">No voter programs are available in your organizer scope.</p>
                )}
                {programs.map((program) => (
                  <label key={program} className="flex items-center gap-2 text-sm text-v-text">
                    <input
                      type="checkbox"
                      checked={selectedPrograms.includes(program)}
                      onChange={(event) => toggleProgram(program, event.target.checked)}
                    />
                    {program}
                  </label>
                ))}
              </div>
            )}
            {/* Shown straight away: it follows directly from choosing "Only selected programs". */}
            {eligibilityMode === 'programs' && !selectedPrograms.length && (
              <p role="alert" className="v-error-text">
                Select at least one program, or allow all voters in the group
              </p>
            )}
          </fieldset>
        )}

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving || !sectionId || !canSubmit}
            className="rounded-lg bg-v-primary px-4 py-2 text-sm text-white hover:bg-v-primary-hover disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add position'}
          </button>
          {sectionId && blockedReason && <p className="v-caption" role="status">{blockedReason}</p>}
        </div>
      </fieldset>
    </form>
  )
}
