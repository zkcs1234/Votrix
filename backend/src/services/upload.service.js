import { Readable } from 'stream'
import { getCloudinary } from '../config/cloudinary.js'
import { ApiError } from '../utils/ApiError.js'
import {
  calculateHash,
  findAssetByHash,
  registerImageAsset,
} from './imageAsset.service.js'

export const UPLOAD_KIND = {
  LOGO: 'logo',
  BANNER: 'banner',
  CANDIDATE_PHOTO: 'candidate_photo',
  CONTESTANT_PHOTO: 'contestant_photo',
  PHOTO: 'photo',
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
  [UPLOAD_KIND.PHOTO]: {
    folder: 'votrix/photos',
    transformation: [{ width: 800, height: 800, crop: 'limit', quality: 'auto' }],
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

export async function uploadImageBuffer(buffer, { kind, publicId, mimetype = 'image/jpeg', originalName = null }) {
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

  // 1. Calculate SHA-256 hash of raw binary buffer
  const fileHash = calculateHash(buffer)

  // 2. Check if asset already exists in image_assets database registry
  try {
    const existingAsset = await findAssetByHash(fileHash)
    if (existingAsset) {
      return {
        public_id: existingAsset.cloudinary_public_id,
        secure_url: existingAsset.cloudinary_url,
        image_asset_id: existingAsset.id,
        asset: existingAsset,
        deduplicated: true,
      }
    }
  } catch (err) {
    console.warn('[upload.service] Could not query image_assets table, proceeding with direct upload:', err.message)
  }

  // 3. Asset does not exist in registry - proceed with Cloudinary upload
  const cloudinary = getCloudinary()
  if (!cloudinary) {
    throw new ApiError(503, 'Cloudinary is not configured. Set CLOUDINARY_* in .env')
  }

  const targetPublicId = publicId || `${kind}-${fileHash.slice(0, 16)}-${Date.now()}`

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: config.folder,
        resource_type: 'image',
        public_id: targetPublicId,
        transformation: config.transformation,
        overwrite: true,
      },
      (error, res) => {
        if (error) reject(new ApiError(502, error.message || 'Upload failed'))
        else resolve(res)
      },
    )

    Readable.from(buffer).pipe(uploadStream)
  })

  // 4. Register new asset in image_assets database registry
  try {
    const assetRecord = await registerImageAsset({
      fileHash,
      cloudinaryPublicId: result.public_id,
      cloudinaryUrl: result.secure_url,
      mimeType: mimetype,
      fileSize: buffer.length,
      width: result.width || null,
      height: result.height || null,
      format: result.format || null,
    })

    return {
      ...result,
      image_asset_id: assetRecord.id,
      asset: assetRecord,
      deduplicated: false,
    }
  } catch (err) {
    console.warn('[upload.service] Failed to register image_asset row:', err.message)
    return {
      ...result,
      image_asset_id: null,
      asset: null,
      deduplicated: false,
    }
  }
}

export async function uploadImageFile(file, kind, idSuffix) {
  assertImageFile(file)
  const publicId = `${kind}-${idSuffix}-${Date.now()}`
  return uploadImageBuffer(file.buffer, {
    kind,
    publicId,
    mimetype: file.mimetype,
    originalName: file.originalname,
  })
}
