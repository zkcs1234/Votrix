import { useEffect, useState } from 'react'
import FormField from '@/components/ui/FormField'
import ImageUploadField from '@/components/upload/ImageUploadField'
import { useLiveForm } from '@/hooks/useLiveForm'
import { candidateSchema, CANDIDATE_DEFAULTS } from '@/schemas/election-builder.schemas'

/**
 * "Add candidate" form for the election candidate builder. Previously a missing
 * position made the button do nothing at all; now every problem shows next to
 * its field as it happens, and the button says why it is unavailable.
 *
 * `onCreate(values, photoFile)` performs the request and resolves to true on
 * success (the form then clears itself).
 */
export default function CandidateForm({ positions, sectionId, saving, onCreate }) {
  const [photoFile, setPhotoFile] = useState(null)
  const [photoKey, setPhotoKey] = useState(0)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    blockedReason,
    canSubmit,
  } = useLiveForm({ schema: candidateSchema, defaultValues: CANDIDATE_DEFAULTS })

  // Switching election group means a different list of positions.
  useEffect(() => {
    reset(CANDIDATE_DEFAULTS)
  }, [sectionId, reset])

  const onSubmit = async (values) => {
    const ok = await onCreate(values, photoFile)
    if (ok) {
      reset(CANDIDATE_DEFAULTS)
      setPhotoFile(null)
      setPhotoKey((k) => k + 1) // remounts the uploader so its preview clears
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 v-card p-6 mb-4" noValidate>
      <FormField label="Position" required error={errors.positionId?.message}>
        {(field) => (
          <select {...field} {...register('positionId')}>
            <option value="">Select position</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <FormField label="Name" required error={errors.name?.message}>
        {(field) => <input {...field} {...register('name')} />}
      </FormField>
      <FormField label="Party" error={errors.party?.message}>
        {(field) => <input placeholder="e.g. Independent" {...field} {...register('party')} />}
      </FormField>
      <FormField label="Biography" error={errors.biography?.message}>
        {(field) => <textarea rows={3} {...field} {...register('biography')} />}
      </FormField>
      <FormField label="Platform" error={errors.platform?.message}>
        {(field) => <textarea rows={3} {...field} {...register('platform')} />}
      </FormField>
      <ImageUploadField key={photoKey} label="Candidate photo" variant="photo" onFileSelect={setPhotoFile} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="rounded-xl bg-v-primary px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Adding...' : 'Add candidate'}
        </button>
        {blockedReason && <p className="v-caption" role="status">{blockedReason}</p>}
      </div>
    </form>
  )
}
