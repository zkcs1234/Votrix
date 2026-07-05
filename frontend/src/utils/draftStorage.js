export const DRAFT_STORAGE_KEYS = {
  electionDraft: 'votrix_election_draft_',
  electionSkipped: 'votrix_election_skipped_',
  pollDraft: 'votrix_poll_draft_',
  competitionDraft: 'votrix_competition_draft_',
  pageantDraft: 'votrix_pageant_draft_',
}

const DRAFT_PREFIXES = Object.values(DRAFT_STORAGE_KEYS)

export function getDraftStorageKey(kind, eventId) {
  return `${DRAFT_STORAGE_KEYS[kind]}${eventId}`
}

export function clearVotrixDrafts() {
  try {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Ignore storage errors during logout cleanup.
  }
}
