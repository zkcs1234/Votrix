#!/usr/bin/env node

/**
 * VOTRIX Maintenance Script: Cleanup Orphaned Cloudinary Assets
 * 
 * This script identifies and removes Cloudinary assets that have zero database
 * references across all 7 image-bearing tables. It provides a safe, dry-run
 * mode by default, and requires explicit confirmation before actually deleting
 * any assets.
 * 
 * Usage:
 *   Dry run (safe, no changes): node backend/src/scripts/cleanup_orphaned_cloudinary_assets.js
 *   Execute deletions:          node backend/src/scripts/cleanup_orphaned_cloudinary_assets.js --execute
 */

import { getCloudinary } from '../config/cloudinary.js'
import { db as getClient } from '../foundation/db.js'
import { DB_TABLES } from '../utils/constants.js'
import { countReferences } from '../services/imageAsset.service.js'

const DRY_RUN = !process.argv.includes('--execute')

/**
 * Fetches all assets from image_assets table
 */
async function getAllAssets() {
  const { data, error } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .select('id, cloudinary_public_id, cloudinary_url, file_hash, file_size')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch assets: ${error.message}`)
  return data || []
}

/**
 * Identifies orphaned assets (zero references across all tables)
 */
async function findOrphanedAssets(assets) {
  const orphans = []

  console.log(`\nChecking ${assets.length} assets for orphans...`)

  for (const asset of assets) {
    const refCount = await countReferences(asset.id)
    if (refCount === 0) {
      orphans.push(asset)
    }
  }

  return orphans
}

/**
 * Deletes an asset from Cloudinary
 */
async function deleteCloudinaryAsset(publicId) {
  const cloudinary = getCloudinary()
  if (!cloudinary) {
    throw new Error('Cloudinary not configured')
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId)
    return result.result === 'ok' || result.result === 'not_found'
  } catch (err) {
    console.error(`  ❌ Cloudinary deletion failed for ${publicId}:`, err.message)
    return false
  }
}

/**
 * Deletes an asset record from image_assets table
 */
async function deleteAssetRecord(assetId) {
  const { error } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .delete()
    .eq('id', assetId)

  if (error) {
    console.error(`  ❌ Database deletion failed for ${assetId}:`, error.message)
    return false
  }

  return true
}

/**
 * Finds Cloudinary assets that don't exist in image_assets (legacy orphans)
 */
async function findCloudinaryOrphans() {
  const cloudinary = getCloudinary()
  if (!cloudinary) {
    console.warn('Cloudinary not configured, skipping Cloudinary orphan scan')
    return []
  }

  console.log('\nScanning Cloudinary for assets not in database...')

  const dbPublicIds = new Set()
  const { data: assets } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .select('cloudinary_public_id')

  for (const asset of assets || []) {
    dbPublicIds.add(asset.cloudinary_public_id)
  }

  const cloudinaryOrphans = []
  const folders = ['votrix/logos', 'votrix/banners', 'votrix/candidates', 'votrix/contestants', 'votrix/photos']

  for (const folder of folders) {
    try {
      let hasMore = true
      let nextCursor = null

      while (hasMore) {
        const result = await cloudinary.api.resources({
          type: 'upload',
          prefix: folder,
          max_results: 500,
          next_cursor: nextCursor,
        })

        for (const resource of result.resources || []) {
          if (!dbPublicIds.has(resource.public_id)) {
            cloudinaryOrphans.push({
              public_id: resource.public_id,
              secure_url: resource.secure_url,
              bytes: resource.bytes,
              created_at: resource.created_at,
            })
          }
        }

        nextCursor = result.next_cursor
        hasMore = !!nextCursor
      }
    } catch (err) {
      console.error(`Failed to scan folder ${folder}:`, err.message)
    }
  }

  return cloudinaryOrphans
}

/**
 * Main cleanup routine
 */
async function cleanupOrphanedAssets() {
  console.log('='.repeat(80))
  console.log('VOTRIX Orphaned Cloudinary Assets Cleanup')
  console.log('='.repeat(80))
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'EXECUTE (will delete assets)'}`)
  console.log('='.repeat(80))

  // Phase 1: Find database-registered orphans (zero references)
  console.log('\n[Phase 1] Finding orphaned assets in image_assets table...')
  const allAssets = await getAllAssets()
  const dbOrphans = await findOrphanedAssets(allAssets)

  console.log(`\nFound ${dbOrphans.length} orphaned assets in database (0 references):`)
  
  let totalSize = 0
  for (const orphan of dbOrphans) {
    totalSize += orphan.file_size || 0
    console.log(`  - ${orphan.cloudinary_public_id} (${(orphan.file_size / 1024).toFixed(2)} KB)`)
  }

  if (dbOrphans.length > 0) {
    console.log(`\nTotal size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
  }

  // Phase 2: Find Cloudinary orphans (not in database)
  console.log('\n[Phase 2] Finding Cloudinary assets not in database...')
  const cloudinaryOrphans = await findCloudinaryOrphans()

  console.log(`\nFound ${cloudinaryOrphans.length} Cloudinary assets not in database:`)
  
  let cloudinaryTotalSize = 0
  for (const orphan of cloudinaryOrphans) {
    cloudinaryTotalSize += orphan.bytes || 0
    console.log(`  - ${orphan.public_id} (${(orphan.bytes / 1024).toFixed(2)} KB)`)
  }

  if (cloudinaryOrphans.length > 0) {
    console.log(`\nTotal size: ${(cloudinaryTotalSize / 1024 / 1024).toFixed(2)} MB`)
  }

  // Execute cleanup if not dry run
  if (!DRY_RUN) {
    console.log('\n' + '='.repeat(80))
    console.log('EXECUTING CLEANUP (destructive operation)')
    console.log('='.repeat(80))

    let deletedDb = 0
    let deletedCloudinary = 0

    // Delete database-registered orphans
    console.log('\n[Phase 1] Deleting database-registered orphans...')
    for (const orphan of dbOrphans) {
      console.log(`\nDeleting: ${orphan.cloudinary_public_id}`)
      
      // Delete from Cloudinary first
      const cloudinaryDeleted = await deleteCloudinaryAsset(orphan.cloudinary_public_id)
      if (cloudinaryDeleted) {
        console.log(`  ✅ Cloudinary deletion successful`)
        deletedCloudinary++
      }

      // Then delete database record
      const dbDeleted = await deleteAssetRecord(orphan.id)
      if (dbDeleted) {
        console.log(`  ✅ Database record deleted`)
        deletedDb++
      }
    }

    // Delete Cloudinary-only orphans
    console.log('\n[Phase 2] Deleting Cloudinary-only orphans...')
    for (const orphan of cloudinaryOrphans) {
      console.log(`\nDeleting: ${orphan.public_id}`)
      
      const deleted = await deleteCloudinaryAsset(orphan.public_id)
      if (deleted) {
        console.log(`  ✅ Cloudinary deletion successful`)
        deletedCloudinary++
      }
    }

    console.log('\n' + '='.repeat(80))
    console.log(`Cleanup complete:`)
    console.log(`  - Database records deleted: ${deletedDb}`)
    console.log(`  - Cloudinary assets deleted: ${deletedCloudinary}`)
    console.log('='.repeat(80))
  } else {
    console.log('\n' + '='.repeat(80))
    console.log('DRY RUN complete - no changes were made')
    console.log('Run with --execute flag to perform actual deletions')
    console.log('='.repeat(80))
  }
}

// Run cleanup if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupOrphanedAssets()
    .then(() => {
      console.log('\n✅ Cleanup finished successfully')
      process.exit(0)
    })
    .catch((err) => {
      console.error('\n❌ Cleanup failed:', err)
      process.exit(1)
    })
}

export { cleanupOrphanedAssets }
