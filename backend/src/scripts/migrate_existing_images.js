#!/usr/bin/env node

/**
 * VOTRIX Migration Script: Existing Images to image_assets Registry
 * 
 * This script backfills the image_assets table with SHA-256 hashes and metadata
 * for all existing images in Cloudinary, then updates all entity tables to
 * populate their image_asset_id foreign keys.
 * 
 * Run this AFTER migration 037_image_assets_schema.sql has been applied.
 * 
 * Usage: node backend/src/scripts/migrate_existing_images.js
 */

import { getCloudinary } from '../config/cloudinary.js'
import { db as getClient } from '../foundation/db.js'
import { DB_TABLES } from '../utils/constants.js'
import { calculateHash, registerImageAsset } from '../services/imageAsset.service.js'
import https from 'https'

const CLOUDINARY_URL_PATTERN = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(votrix\/[^/]+\/[^.]+)/

/**
 * Downloads an image buffer from a URL
 */
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }

      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
  })
}

/**
 * Extracts Cloudinary public_id from a secure_url
 */
function extractPublicId(secureUrl) {
  const match = secureUrl.match(CLOUDINARY_URL_PATTERN)
  return match ? match[1] : null
}

/**
 * Queries Cloudinary Admin API for asset metadata
 */
async function getCloudinaryMetadata(publicId) {
  const cloudinary = getCloudinary()
  if (!cloudinary) return null

  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'image' })
    return {
      public_id: result.public_id,
      secure_url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    }
  } catch (err) {
    console.warn(`[migrate] Cloudinary metadata fetch failed for ${publicId}:`, err.message)
    return null
  }
}

/**
 * Processes a single image URL: downloads, hashes, registers in image_assets
 */
async function processImageUrl(url) {
  if (!url || typeof url !== 'string') return null

  const publicId = extractPublicId(url)
  if (!publicId) {
    console.warn(`[migrate] Could not extract public_id from URL: ${url}`)
    return null
  }

  // Check if already registered
  const { data: existing } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .select('id, cloudinary_public_id')
    .eq('cloudinary_public_id', publicId)
    .maybeSingle()

  if (existing) {
    console.log(`[migrate] Asset already registered: ${publicId}`)
    return existing.id
  }

  // Download image and calculate hash
  let buffer
  try {
    buffer = await downloadImage(url)
  } catch (err) {
    console.error(`[migrate] Download failed for ${url}:`, err.message)
    return null
  }

  const fileHash = calculateHash(buffer)

  // Check if this hash already exists (deduplicate immediately)
  const { data: hashExists } = await getClient()
    .from(DB_TABLES.IMAGE_ASSETS)
    .select('id, cloudinary_public_id')
    .eq('file_hash', fileHash)
    .maybeSingle()

  if (hashExists) {
    console.log(`[migrate] Hash collision detected! ${publicId} matches existing ${hashExists.cloudinary_public_id}`)
    return hashExists.id
  }

  // Fetch metadata from Cloudinary
  const metadata = await getCloudinaryMetadata(publicId)
  if (!metadata) {
    console.warn(`[migrate] No metadata available for ${publicId}, using defaults`)
  }

  // Register in image_assets
  try {
    const asset = await registerImageAsset({
      fileHash,
      cloudinaryPublicId: publicId,
      cloudinaryUrl: url,
      mimeType: metadata?.format ? `image/${metadata.format}` : 'image/jpeg',
      fileSize: metadata?.bytes || buffer.length,
      width: metadata?.width || null,
      height: metadata?.height || null,
      format: metadata?.format || null,
    })

    console.log(`[migrate] Registered ${publicId} → ${asset.id}`)
    return asset.id
  } catch (err) {
    console.error(`[migrate] Failed to register ${publicId}:`, err.message)
    return null
  }
}

/**
 * Updates entity table with image_asset_id
 */
async function updateEntityImageAssetId(table, column, imageColumn, entityId, assetId) {
  const { error } = await getClient()
    .from(table)
    .update({ [column]: assetId })
    .eq('id', entityId)

  if (error) {
    console.error(`[migrate] Failed to update ${table}.${column} for ${entityId}:`, error.message)
  }
}

/**
 * Main migration routine
 */
async function migrateExistingImages() {
  console.log('='.repeat(80))
  console.log('VOTRIX Image Assets Migration: Existing Images → image_assets Registry')
  console.log('='.repeat(80))

  // 1. Migrate organization logos (users.organization_logo)
  console.log('\n[1/7] Migrating organization logos...')
  const { data: users } = await getClient()
    .from(DB_TABLES.USERS)
    .select('id, organization_logo')
    .not('organization_logo', 'is', null)

  for (const user of users || []) {
    const assetId = await processImageUrl(user.organization_logo)
    if (assetId) {
      await updateEntityImageAssetId(DB_TABLES.USERS, 'image_asset_id', 'organization_logo', user.id, assetId)
    }
  }

  // 2. Migrate event banners (events.banner)
  console.log('\n[2/7] Migrating event banners...')
  const { data: events } = await getClient()
    .from(DB_TABLES.EVENTS)
    .select('id, banner')
    .not('banner', 'is', null)

  for (const event of events || []) {
    const assetId = await processImageUrl(event.banner)
    if (assetId) {
      await updateEntityImageAssetId(DB_TABLES.EVENTS, 'image_asset_id', 'banner', event.id, assetId)
    }
  }

  // 3. Migrate candidate photos (candidates.photo)
  console.log('\n[3/7] Migrating candidate photos...')
  const { data: candidates } = await getClient()
    .from(DB_TABLES.CANDIDATES)
    .select('id, photo')
    .not('photo', 'is', null)

  for (const candidate of candidates || []) {
    const assetId = await processImageUrl(candidate.photo)
    if (assetId) {
      await updateEntityImageAssetId(DB_TABLES.CANDIDATES, 'image_asset_id', 'photo', candidate.id, assetId)
    }
  }

  // 4. Migrate contestant photos (competition_contestants.photo)
  console.log('\n[4/7] Migrating contestant photos...')
  const { data: contestants } = await getClient()
    .from('competition_contestants')
    .select('id, photo')
    .not('photo', 'is', null)

  for (const contestant of contestants || []) {
    const assetId = await processImageUrl(contestant.photo)
    if (assetId) {
      await updateEntityImageAssetId('competition_contestants', 'image_asset_id', 'photo', contestant.id, assetId)
    }
  }

  // 5. Migrate poll question images (poll_questions.image_url)
  console.log('\n[5/7] Migrating poll question images...')
  const { data: pollQuestions } = await getClient()
    .from(DB_TABLES.POLL_QUESTIONS)
    .select('id, image_url')
    .not('image_url', 'is', null)

  for (const question of pollQuestions || []) {
    const assetId = await processImageUrl(question.image_url)
    if (assetId) {
      await updateEntityImageAssetId(DB_TABLES.POLL_QUESTIONS, 'image_asset_id', 'image_url', question.id, assetId)
    }
  }

  // 6. Migrate poll option images (poll_options.image_url)
  console.log('\n[6/7] Migrating poll option images...')
  const { data: pollOptions } = await getClient()
    .from(DB_TABLES.POLL_OPTIONS)
    .select('id, image_url')
    .not('image_url', 'is', null)

  for (const option of pollOptions || []) {
    const assetId = await processImageUrl(option.image_url)
    if (assetId) {
      await updateEntityImageAssetId(DB_TABLES.POLL_OPTIONS, 'image_asset_id', 'image_url', option.id, assetId)
    }
  }

  // 7. Migrate draft banners (event_drafts.banner)
  console.log('\n[7/7] Migrating draft banners...')
  const { data: drafts } = await getClient()
    .from(DB_TABLES.EVENT_DRAFTS)
    .select('id, banner')
    .not('banner', 'is', null)

  for (const draft of drafts || []) {
    const assetId = await processImageUrl(draft.banner)
    if (assetId) {
      await updateEntityImageAssetId(DB_TABLES.EVENT_DRAFTS, 'image_asset_id', 'banner', draft.id, assetId)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('Migration complete!')
  console.log('='.repeat(80))
}

// Run migration if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateExistingImages()
    .then(() => {
      console.log('\n✅ Migration finished successfully')
      process.exit(0)
    })
    .catch((err) => {
      console.error('\n❌ Migration failed:', err)
      process.exit(1)
    })
}

export { migrateExistingImages }
