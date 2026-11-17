import { useMemo } from 'react'
import FormField from '@/components/ui/FormField'
import { useLiveForm } from '@/hooks/useLiveForm'
import { buildGroupNameSchema } from '@/schemas/election-builder.schemas'

/**
 * One-field form for an election group name, used both to add a group and to
 * rename one inline (replacing the old browser prompt). Required, at most 255
 * characters and unique among the other groups, all checked while typing.
 *
 * `onSubmit(name)` does the request; resolve to true on success so the field
 * clears. Pass `onCancel` for the rename variant.
 */
export default function GroupNameForm({
  otherNames,
  initialName = '',
  submitLabel,
  savingLabel,
  saving = false,
  onSubmit,
  onCancel,
  ariaLabel = 'Election group name',
  placeholder,
  autoFocus = false,
}) {
  const schema = useMemo(() => buildGroupNameSchema(otherNames), [otherNames])
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
    canSubmit,
  } = useLiveForm({ schema, defaultValues: { name: initialName } })

  const submit = handleSubmit(async ({ name }) => {
    const ok = await onSubmit(name)
    if (ok) reset({ name: onCancel ? name : '' })
  })

  const unchanged = Boolean(onCancel) && watch('name').trim() === initialName.trim()

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <FormField error={errors.name?.message} counter={{ value: watch('name'), max: 255 }}>
        {(field) => (
          <input
            placeholder={placeholder}
            aria-label={ariaLabel}
            autoFocus={autoFocus}
            autoComplete="off"
            {...field}
            {...register('name')}
          />
        )}
      </FormField>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !canSubmit || unchanged}
          className="rounded-md bg-v-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? savingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-md px-3 py-2 text-sm text-v-text-muted">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
