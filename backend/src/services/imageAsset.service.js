import crypto from 'crypto'
import { db as getClient } from '../foundation/db.js'
import { getCloudinary } from '../config/cloudinary.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES } from '../utils/constants.js'

/**
 * Calculates SHA-256 hex hash from a raw binary Buffer.
 */
export function calculateHash(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new ApiError(400, 'Invalid image buffer for hashing')
  }
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Counts active references to an image_asset across all 7 image-bearing tables.
 *
 * @param {string} assetId - UUID of the image_asset
 * @returns {Promise<number>} Total live reference count
 */
export async function countReferences(assetId) {
  if (!assetId) return 0
  const db = getClient()

  const queries = [
    db.from(DB_TABLES.USERS).select('id', { count: 'exact', head: true }).eq('image_asset_id', assetId),
    db.from(DB_TABLES.EVENTS).select('id', { count: 'exact', head: true }).eq('image_asset_id', assetId),
    db.from(DB_TABLES.CANDIDATES).select('id', { count: 'exact', head: true }).eq('image_asset_id', assetId),
    // Note: Use the actual table name, not the view
    db.from('competition_contestants').select('id', { count: 'exact', head: true }).eq('image_asset_id', assetId),
    db.from(DB_TABLES.POLL_QUESTIONS).select('id', { count: 'exact', head: true }).eq('image_asset_id', assetId),
    db.from(DB_TABLES.POLL_OPTIONS).select('id', { count: 'exact', head: true }).eq('image_asset_id', assetId),
    db.from(DB_TABLES.EVENT_DRAFTS).select('id', { count: 'exact', head: true }).eq('image_asset_id', assetId),
  ]

  const results = await Promise.all(queries)
  return results.reduce((sum, res) => sum + (res.count || 0), 0)
}

/**
 * Queues a Cloudinary public ID for retried asynchronous deletion.
 */
export async function queueForDeletion(cloudinaryPublicId, lastError = null) {
  if (!cloudinaryPublicId) return
  const { error } = await getClient()
    .from(DB_TABLES.IMAGE_DELETION_QUEUE)
    .insert({
      cloudinary_public_id: cloudinaryPublicId,
      last_error: lastError ? String(lastError) : null,
    })

  if (error) {
    console.error(`[imageAsset] Failed to insert ${cloudinaryPublicId} into deletion queue:`, error.message)
  }
}

/**
 * Attempts to delete a Cloudinary asset by public_id. If Cloudinary fails,
 * adds the public_id to `image_deletion_queue` for retry.
 */
export async function destroyCloudinaryAsset(cloudinaryPublicId) {
  if (!cloudinaryPublicId) return
  const cloudinary = getCloudinary()
  if (!cloudinary) {
    console.warn(`[imageAsset] Cloudinary not configured; queueing ${cloudinaryPublicId} for deletion`)
    await queueForDeletion(cloudinaryPublicId, 'Cloudinary not configured')
    return
  }

  try {
    const result = await cloudinary.uploader.destroy(cloudinaryPublicId)
    if (result?.result !== 'ok' && result?.result !== 'not_found') {
      console.warn(`[imageAsset] Cloudinary destroy result not ok for ${cloudinaryPublicId}:`, result)
      await queueForDeletion(cloudinaryPublicId, JSON.stringify(result))
    }
  } catch (err) {
    console.error(`[imageAsset] Cloudinary destroy error for ${cloudinaryPublicId}:`, err.message)
    await queueForDeletion(cloudinaryPublicId, err.message)
  }
}

/**
 * Checks remaining reference count for an asset. If 0 references remain,
 * deletes the asset record from `image_assets` and destroys the Cloudinary asset.
 *
 * @param {string} assetId - UUID of the image_asset
 */
export async function removeReferenceAndDeleteIfUnused(assetId) {
  if (!assetId) return
  const refCount = await countReferences(assetId)
  if (refCount > 0) {
    return // Asset still referenced by other entities
  }

  // Fetch asset details before deletion
  const { data: asset, error: fetchErr } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .select('id, cloudinary_public_id')
    .eq('id', assetId)
    .maybeSingle()

  if (fetchErr || !asset) return

  // Delete DB asset record first (prevent race conditions)
  const { error: delErr } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .delete()
    .eq('id', assetId)

  if (delErr) {
    console.error(`[imageAsset] Failed to delete image_assets row ${assetId}:`, delErr.message)
    return
  }

  // Destroy Cloudinary asset (retryable queue on failure)
  await destroyCloudinaryAsset(asset.cloudinary_public_id)
}

/**
 * Process pending items in `image_deletion_queue`.
 */
export async function processDeletionQueue(limit = 20) {
  const db = getClient()
  const { data: queueItems, error } = await db
    .from(DB_TABLES.IMAGE_DELETION_QUEUE)
    .select('*')
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error || !queueItems || queueItems.length === 0) return

  const cloudinary = getCloudinary()
  if (!cloudinary) return

  for (const item of queueItems) {
    try {
      const res = await cloudinary.uploader.destroy(item.cloudinary_public_id)
      if (res?.result === 'ok' || res?.result === 'not_found') {
        await db.from(DB_TABLES.IMAGE_DELETION_QUEUE).delete().eq('id', item.id)
      } else {
        await db
          .from(DB_TABLES.IMAGE_DELETION_QUEUE)
          .update({
            attempts: item.attempts + 1,
            last_error: JSON.stringify(res),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
      }
    } catch (err) {
      await db
        .from(DB_TABLES.IMAGE_DELETION_QUEUE)
        .update({
          attempts: item.attempts + 1,
          last_error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
    }
  }
}

/**
 * Gets an existing image_asset by file_hash or creates a new one.
 * Atomic and duplicate-safe using file_hash UNIQUE constraint.
 */
export async function findAssetByHash(fileHash) {
  const { data, error } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .select('*')
    .eq('file_hash', fileHash)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data ?? null
}

/**
 * Registers an uploaded image asset in `image_assets`.
 */
export async function registerImageAsset({
  fileHash,
  cloudinaryPublicId,
  cloudinaryUrl,
  mimeType,
  fileSize,
  width = null,
  height = null,
  format = null,
}) {
  const { data, error } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .upsert(
      {
        file_hash: fileHash,
        cloudinary_public_id: cloudinaryPublicId,
        cloudinary_url: cloudinaryUrl,
        mime_type: mimeType,
        file_size: fileSize,
        width,
        height,
        format,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'file_hash' },
    )
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)
  return data
}
