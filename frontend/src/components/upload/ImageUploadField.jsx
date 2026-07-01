import { useState } from 'react'
import { Upload, ImageIcon } from 'lucide-react'

const VARIANT_STYLES = {
  logo: 'h-24 w-24 rounded-xl object-cover',
  banner: 'mt-2 h-32 w-full rounded-lg object-cover',
  photo: 'mt-2 h-40 w-full rounded-lg object-cover',
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
  // upload) we re-derive the preview by remounting the field via a key.
  const [preview, setPreview] = useState(currentUrl ?? null)

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const maxBytes = 5 * 1024 * 1024
    if (file.size > maxBytes) {
      window.alert('Image must be 5 MB or smaller.')
      e.target.value = ''
      return
    }

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

      <p className="mt-2 text-xs text-v-text-subtle">JPEG, PNG, WebP, or GIF Â· max 5 MB</p>
    </div>
  )
}
