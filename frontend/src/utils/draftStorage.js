const DRAFT_PREFIXES = [
  'votrix_election_draft_',
  'votrix_election_skipped_',
  'votrix_poll_draft_',
  'votrix_competition_draft_',
  'votrix_pageant_draft_',
]

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
