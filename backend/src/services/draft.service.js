import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES } from '../utils/constants.js'
import { removeReferenceAndDeleteIfUnused } from './imageAsset.service.js'

/**
 * Persistent organizer drafts for unfinished Create sessions.
 *
 * Drafts are scoped to (organizer_id, module) — one draft per module per
 * organizer. They are Create-only by construction: a draft row carries no
 * `event_id`, so it can never be confused with or merged into an existing
 * event. Voter/respondent/judge registration and invitations are event-scoped
 * operations that happen AFTER an event is created and are never part of a
 * draft.
 */

/** Returns the draft for (organizer, module), or null when none exists. */
export async function getDraft(organizerId, module) {
  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_DRAFTS)
    .select('*')
    .eq('organizer_id', organizerId)
    .eq('module', module)
    .maybeSingle()

  if (error) throw new ApiError(500, error.message)
  return data ?? null
}

/** Upsert: creates a fresh draft or updates the existing one for (organizer, module). */
export async function saveDraft(organizerId, module, { step, title, banner, payload, image_asset_id }) {
  // Capture old image_asset_id before updating so we can clean it up if replaced
  let oldAssetId = null
  if (image_asset_id !== undefined) {
    const existing = await getDraft(organizerId, module)
    oldAssetId = existing?.image_asset_id ?? null
  }

  const { data, error } = await getClient()
    .from(DB_TABLES.EVENT_DRAFTS)
    .upsert(
      {
        organizer_id: organizerId,
        module,
        step: step ?? 'details',
        title: title ?? null,
        banner: banner ?? null,
        image_asset_id: image_asset_id ?? null,
        payload: payload ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organizer_id,module' },
    )
    .select('*')
    .single()

  if (error) throw new ApiError(500, error.message)

  // Cleanup old draft banner asset if it was replaced
  if (oldAssetId && image_asset_id !== undefined && oldAssetId !== image_asset_id) {
    removeReferenceAndDeleteIfUnused(oldAssetId).catch((err) =>
      console.error('[draft] Old draft banner cleanup error:', err.message),
    )
  }

  return data
}

/** Delete / discard. Idempotent — a missing draft is not an error. */
export async function deleteDraft(organizerId, module) {
  // Fetch draft image_asset_id before deleting for cleanup
  const draft = await getDraft(organizerId, module)
  const assetId = draft?.image_asset_id ?? null

  const { error } = await getClient()
    .from(DB_TABLES.EVENT_DRAFTS)
    .delete()
    .eq('organizer_id', organizerId)
    .eq('module', module)

  if (error) throw new ApiError(500, error.message)

  // Cleanup draft banner asset if no other entities reference it
  if (assetId) {
    removeReferenceAndDeleteIfUnused(assetId).catch((err) =>
      console.error('[draft] Draft banner cleanup error:', err.message),
    )
  }
}

/**
 * Publish: create the real event from the draft payload via the module's
 * existing createEvent service, then clear the draft.
 *
 * `createFn(organizerId, payload)` is the module's create service
 * (createElectionEvent / createCompetitionEvent / createPollEvent), so no
 * business logic is duplicated. Draft cleanup is best-effort: if it fails the
 * published event still stands, and a stale draft is discarded the next time
 * the organizer chooses "Start New".
 */
export async function publishDraft(organizerId, module, createFn, payload) {
  const event = await createFn(organizerId, payload)
  try {
    await deleteDraft(organizerId, module)
  } catch (err) {
    console.error(`[draft] failed to clear draft after publish (${module}):`, err.message)
  }
  return event
}
