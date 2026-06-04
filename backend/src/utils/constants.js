export const USER_ROLES = {
  ADMIN: 'admin',
  ORGANIZER: 'organizer',
  VOTER: 'voter',
}

export const ACCOUNT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
}

// Organization types. The 'pageant' value is kept as a backward-compatibility
// alias for any rows inserted before the rename; new code paths use
// 'competition_scoring'.
export const ORG_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
  COMPETITION_SCORING: 'competition_scoring',
  POLLING: 'polling',
}

export const ORG_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
}

export const EVENT_STATUS = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

// Event types. 'pageant' is kept for backward compatibility.
export const EVENT_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
  COMPETITION_SCORING: 'competition_scoring',
  POLLING: 'polling',
}

// Set of all event types that use the competition-scoring model.
export const COMPETITION_SCORING_EVENT_TYPES = new Set([
  EVENT_TYPES.PAGEANT,
  EVENT_TYPES.COMPETITION_SCORING,
])

export const POLL_QUESTION_TYPES = {
  SINGLE_CHOICE: 'single_choice',
  MULTIPLE_CHOICE: 'single_choice',
  CHECKBOX: 'checkbox',
  YES_NO: 'yes_no',
  TEXT: 'text',
  RATING: 'rating',
}

export const DB_TABLES = {
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  EVENTS: 'events',
  EVENT_VOTERS: 'event_voters',
  INVITATIONS: 'invitations',
  POSITIONS: 'positions',
  CANDIDATES: 'candidates',
  CONTESTANTS: 'competition_contestants',
  CRITERIA: 'competition_criteria',
  JUDGE_SCORES: 'competition_scores',
  POLL_QUESTIONS: 'poll_questions',
  POLL_ANSWERS: 'poll_answers',
  PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  ELECTION_VOTES: 'election_votes',
  POLL_OPTIONS: 'poll_options',
  POLL_SUBMISSIONS: 'poll_submissions',
  SYSTEM_SETTINGS: 'system_settings',
  AUDIT_LOGS: 'audit_logs',
  NOTIFICATIONS: 'notifications',
}
