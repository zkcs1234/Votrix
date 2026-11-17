import { useState, useEffect } from 'react'
import { Upload, ImageIcon } from 'lucide-react'

const VARIANT_STYLES = {
  logo: 'h-24 w-24 rounded-xl object-cover',
  banner: 'mt-2 h-32 w-full rounded-lg object-cover',
  photo: 'mt-2 h-40 w-full rounded-lg object-cover',
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Returns a message when the file cannot be used, otherwise null.
function imageFileProblem(file, accept) {
  const allowed = accept.split(',').map((type) => type.trim()).filter(Boolean)
  if (file.type && allowed.length && !allowed.includes(file.type)) {
    return `"${file.name}" is not a supported image. Use JPEG, PNG, WebP or GIF.`
  }
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 5 MB or smaller.'
  return null
}

export default function ImageUploadField({
  label,
  hint,
  variant = 'photo',
  currentUrl,
  onFileSelect,
  disabled = false,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
}) {
  // The local preview is only updated when the user picks a new file.
  // When the parent passes a new `currentUrl` (e.g. after a successful
  // upload or when loading existing data), update the preview.
  const [preview, setPreview] = useState(currentUrl ?? null)
  const [error, setError] = useState(null)

  // Sync preview with currentUrl when it changes (e.g., when editing existing event)
  useEffect(() => {
    if (currentUrl !== preview) {
      // Clean up old blob URL if it exists
      if (preview?.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
      setPreview(currentUrl ?? null)
    }
  }, [currentUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // `accept` only filters the file picker; a dragged or "All files" pick can still
    // be the wrong kind, so check here and say why next to the field (not in a
    // blocking browser alert).
    const problem = imageFileProblem(file, accept)
    if (problem) {
      setError(problem)
      e.target.value = ''
      return
    }
    setError(null)

    if (preview?.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }
    setPreview(URL.createObjectURL(file))
    onFileSelect?.(file)
  }

  return (
    <div>
      {label && <label className="mb-1 block text-sm text-v-text-muted">{label}</label>}
      {hint && <p className="mb-2 text-xs text-v-text-subtle">{hint}</p>}

      <div className="flex flex-wrap items-start gap-4">
        {preview && (
          <img src={preview} alt="" className={VARIANT_STYLES[variant] ?? VARIANT_STYLES.photo} />
        )}
        <label
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-v-border-strong px-4 py-3 text-sm text-v-text-subtle hover:border-v-border-strong hover:text-v-text-muted ${
            disabled ? 'pointer-events-none opacity-50' : ''
          }`}
        >
          {preview ? (
            <ImageIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          ) : (
            <Upload className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          )}
          {preview ? 'Change image' : 'Choose image'}
          <input
            type="file"
            accept={accept}
            className="sr-only"
            disabled={disabled}
            onChange={handleChange}
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-v-danger">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-v-text-subtle">JPEG, PNG, WebP, or GIF · max 5 MB</p>
      )}
    </div>
  )
}
