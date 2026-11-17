import { Readable } from 'stream'
import { getCloudinary } from '../config/cloudinary.js'
import { ApiError } from '../utils/ApiError.js'

// Private storage for organizer-application certificates.
//
// Deliberately NOT built on upload.service / image_assets: that path is
// image-only, applies transformations, deduplicates by content hash across
// users, and returns public URLs. Certificates are personal documents, so
// they are stored with Cloudinary delivery type "authenticated" (a signed URL
// is required to view them) and are never registered in the shared registry.

export const CERTIFICATE_MAX_FILES = 5
export const CERTIFICATE_MAX_BYTES = 8 * 1024 * 1024
const FOLDER = 'votrix/organizer-certificates'

// Content sniffing by magic bytes. The browser-supplied MIME type and file
// extension are attacker-controlled, so they are never trusted on their own.
export function detectCertificateMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png'
  }
  return null
}

/**
 * Validate the uploaded files without any side effects. Returns the verified
 * list [{ buffer, name, mime, size }]. Throws a 400 listing every problem.
 */
export function validateCertificateFiles(files) {
  const list = Array.isArray(files) ? files : []
  if (list.length < 1) throw new ApiError(400, 'Validation failed', { errors: ['at least one certificate is required'] })
  if (list.length > CERTIFICATE_MAX_FILES) {
    throw new ApiError(400, 'Validation failed', { errors: [`at most ${CERTIFICATE_MAX_FILES} certificates are allowed`] })
  }

  const errors = []
  const verified = []
  for (const file of list) {
    const name = String(file?.originalname ?? 'certificate').slice(0, 200)
    if (!file?.buffer || file.buffer.length === 0) {
      errors.push(`"${name}" is empty`)
      continue
    }
    if (file.buffer.length > CERTIFICATE_MAX_BYTES) {
      errors.push(`"${name}" is larger than ${CERTIFICATE_MAX_BYTES / (1024 * 1024)} MB`)
      continue
    }
    const mime = detectCertificateMime(file.buffer)
    if (!mime) {
      errors.push(`"${name}" is not a PDF, JPEG or PNG file`)
      continue
    }
    verified.push({ buffer: file.buffer, name, mime, size: file.buffer.length })
  }
  if (errors.length) throw new ApiError(400, 'Validation failed', { errors })
  return verified
}

/** Upload one verified file privately. Returns the reference stored on the application. */
export async function uploadCertificate({ buffer, name, mime, size }, { keyPrefix }) {
  const cloudinary = getCloudinary()
  if (!cloudinary) throw new ApiError(503, 'File storage is not configured. Set CLOUDINARY_* in .env')

  const publicId = `${keyPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: FOLDER,
        resource_type: 'auto',
        type: 'authenticated',
        public_id: publicId,
        overwrite: false,
      },
      (error, res) => {
        if (error) reject(new ApiError(502, error.message || 'Certificate upload failed'))
        else resolve(res)
      },
    )
    Readable.from(buffer).pipe(stream)
  })

  return {
    publicId: result.public_id,
    resourceType: result.resource_type,
    format: result.format ?? null,
    name,
    mime,
    size,
  }
}

/** Best-effort removal, used to roll back after a failed submission. */
export async function deleteCertificates(refs) {
  const cloudinary = getCloudinary()
  if (!cloudinary) return
  await Promise.all(
    (refs ?? []).map((ref) =>
      cloudinary.uploader
        .destroy(ref.publicId, { resource_type: ref.resourceType || 'image', type: 'authenticated' })
        .catch((err) => console.warn('[certificate-storage] cleanup failed:', err.message)),
    ),
  )
}

/**
 * Signed delivery URL for an admin reviewing the application. The raw
 * Cloudinary reference never leaves the server unsigned.
 */
export function getCertificateAccessUrl(ref) {
  const cloudinary = getCloudinary()
  if (!cloudinary || !ref?.publicId) return null
  const options = {
    resource_type: ref.resourceType || 'image',
    type: 'authenticated',
    sign_url: true,
    secure: true,
  }
  if (options.resource_type !== 'raw' && ref.format) options.format = ref.format
  return cloudinary.url(ref.publicId, options)
}
