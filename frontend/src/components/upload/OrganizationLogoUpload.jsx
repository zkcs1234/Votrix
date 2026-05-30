import { useState } from 'react'
import ImageUploadField from '@/components/upload/ImageUploadField'

export default function OrganizationLogoUpload({
  organizationName,
  logoUrl,
  onUpload,
  accentClass = 'text-v-text-muted',
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [logo, setLogo] = useState(logoUrl)

  const handleFile = async (file) => {
    setUploading(true)
    setError(null)
    try {
      const { data } = await onUpload(file)
      setLogo(data.organization?.logo ?? data.url)
    } catch (err) {
      setError(err.response?.data?.message || 'Logo upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="v-card p-6">
      <h3 className="font-medium text-v-text">Organization logo</h3>
      <p className={`mt-1 text-sm ${accentClass}`}>{organizationName}</p>
      <p className="mt-1 text-xs text-v-text-subtle">
        Uploaded to Cloudinary. Shown on dashboards and branded views.
      </p>

      <div className="mt-4">
        <ImageUploadField
          variant="logo"
          currentUrl={logo}
          disabled={uploading}
          onFileSelect={handleFile}
        />
      </div>

      {uploading && <p className="mt-2 text-xs text-v-text-subtle">Uploadingâ€¦</p>}
      {error && <p className="mt-2 text-xs text-v-danger">{error}</p>}
    </div>
  )
}
