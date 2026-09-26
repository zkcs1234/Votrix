import { getSystemSettings, saveSystemSetting } from './admin.service.js'
import { PARTICIPANT_TAXONOMY_SETTING_KEY } from '../utils/constants.js'

// Phase 2 of VOTER_PROFILE_AND_ADMIN_REGISTRATION_PLAN.md (decision D13).
//
// The admin maintains the canonical lists of valid Programs and Year & Sections
// for student participants. These lists live in the existing `system_settings`
// table (no new table) under the `participant_taxonomy` key with shape:
//   { programs: string[], sections: string[] }
//
// Later phases use these lists to validate CSV imports (Phase 3) and to power
// the organizer cohort picker (Phase 5).

export const DEFAULT_PARTICIPANT_TAXONOMY = { programs: [], sections: [] }

const TAXONOMY_DESCRIPTION =
  'Managed lists of valid Programs and Year & Sections for student participants (plan D13).'

// Trim, drop blanks, de-duplicate case-insensitively (keeping the first spelling
// seen), and sort. Keeps the stored lists clean regardless of input order/case.
function normalizeList(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const raw of list) {
    const value = String(raw ?? '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

function normalizeTaxonomy(input) {
  return {
    programs: normalizeList(input?.programs),
    sections: normalizeList(input?.sections),
  }
}

export async function getParticipantTaxonomy() {
  const settings = await getSystemSettings()
  const setting = settings.find((s) => s.setting_key === PARTICIPANT_TAXONOMY_SETTING_KEY)
  return normalizeTaxonomy(setting?.setting_value ?? DEFAULT_PARTICIPANT_TAXONOMY)
}

export async function updateParticipantTaxonomy(input) {
  const normalized = normalizeTaxonomy(input)
  await saveSystemSetting(PARTICIPANT_TAXONOMY_SETTING_KEY, normalized, TAXONOMY_DESCRIPTION)
  return normalized
}
