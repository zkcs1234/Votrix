import { Readable } from 'stream'
import { getCloudinary } from '../config/cloudinary.js'
import { ApiError } from '../utils/ApiError.js'

export const UPLOAD_KIND = {
  LOGO: 'logo',
  BANNER: 'banner',
  CANDIDATE_PHOTO: 'candidate_photo',
  CONTESTANT_PHOTO: 'contestant_photo',
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const UPLOAD_CONFIG = {
  [UPLOAD_KIND.LOGO]: {
    folder: 'votrix/logos',
    transformation: [{ width: 400, height: 400, crop: 'limit', quality: 'auto' }],
  },
  [UPLOAD_KIND.BANNER]: {
    folder: 'votrix/banners',
    transformation: [{ width: 1600, height: 500, crop: 'limit', quality: 'auto' }],
  },
  [UPLOAD_KIND.CANDIDATE_PHOTO]: {
    folder: 'votrix/candidates',
    transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'auto', quality: 'auto' }],
  },
  [UPLOAD_KIND.CONTESTANT_PHOTO]: {
    folder: 'votrix/contestants',
    transformation: [{ width: 500, height: 500, crop: 'fill', gravity: 'auto', quality: 'auto' }],
  },
}

export function assertImageFile(file) {
  if (!file) {
    throw new ApiError(400, 'Image file is required')
  }
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new ApiError(400, 'Invalid file type. Use JPEG, PNG, WebP, or GIF.')
  }
}

export async function uploadImageBuffer(buffer, { kind, publicId }) {
  // CWE-918: Reject non-Buffer inputs before piping to Cloudinary's upload
  // stream. A non-buffer value (e.g. a URL string) could be used to trigger
  // SSRF via the stream pipeline.
  if (!Buffer.isBuffer(buffer)) {
    throw new ApiError(400, 'Invalid upload data')
  }

  const config = UPLOAD_CONFIG[kind]
  if (!config) {
    throw new ApiError(500, 'Unknown upload kind')
  }

  const cloudinary = getCloudinary()
  if (!cloudinary) {
    throw new ApiError(503, 'Cloudinary is not configured. Set CLOUDINARY_* in .env')
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: config.folder,
        resource_type: 'image',
        public_id: publicId,
        transformation: config.transformation,
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(new ApiError(502, error.message || 'Upload failed'))
        else resolve(result)
      },
    )

    Readable.from(buffer).pipe(uploadStream)
  })
}

export async function uploadImageFile(file, kind, idSuffix) {
  assertImageFile(file)
  const publicId = `${kind}-${idSuffix}-${Date.now()}`
  return uploadImageBuffer(file.buffer, { kind, publicId })
}
