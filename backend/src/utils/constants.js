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
  ARCHIVED: 'archived',
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

// Legacy aliases preserved for backward compatibility with existing callers.
// The Phase 7 question-type registry is the source of truth — these constants
// are convenience lookups for code paths that still use them.
export const POLL_QUESTION_TYPES = {
  SINGLE_CHOICE: 'single_choice',
  MULTIPLE_CHOICE: 'multiple_choice',
  CHECKBOX: 'checkbox',
  YES_NO: 'yes_no',
  TEXT: 'text',
  OPEN_TEXT: 'open_text',
  RATING: 'rating',
  LIKERT_SCALE: 'likert_scale',
  RANKING: 'ranking',
}

// Scoring configuration (Phase 5). Stored on events.scoring_config as JSONB.
// Keep these in sync with the JSONB shape in migration 015.
export const SCORE_TYPES = {
  RANGE_1_10: 'range_1_10',
  RANGE_1_100: 'range_1_100',
  DECIMAL: 'decimal',
  CUSTOM_RANGE: 'custom_range',
}

export const CALCULATION_METHODS = {
  AVERAGE: 'average',
  WEIGHTED_AVERAGE: 'weighted_average',
  SUM: 'sum',
  HIGHEST_SCORE: 'highest_score',
  LOWEST_REMOVAL: 'lowest_removal',
}

// Judge permission roles (Phase 6).
export const JUDGE_ROLES = {
  JUDGE: 'judge',
  HEAD_JUDGE: 'head_judge',
  SCORE_REVIEWER: 'score_reviewer',
}

export const ASSIGNMENT_SCOPES = {
  EVENT: 'event',
  CATEGORY: 'category',
  ROUND: 'round',
}

// Event participant types (used for event-scoped roles)
export const PARTICIPANT_TYPES = {
  ELECTION_VOTER: 'ELECTION_VOTER',
  COMPETITION_JUDGE: 'COMPETITION_JUDGE',
  POLLING_RESPONDENT: 'POLLING_RESPONDENT',
}

// Labels for participant types (for frontend display)
export const PARTICIPANT_TYPE_LABELS = {
  [PARTICIPANT_TYPES.ELECTION_VOTER]: { label: 'Voter', color: 'indigo', icon: 'Vote' },
  [PARTICIPANT_TYPES.COMPETITION_JUDGE]: { label: 'Judge', color: 'pink', icon: 'Trophy' },
  [PARTICIPANT_TYPES.POLLING_RESPONDENT]: { label: 'Respondent', color: 'cyan', icon: 'BarChart2' },
}

export const DB_TABLES = {
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  EVENTS: 'events',
  // Backward compatibility: use view for event_voters queries
  // The view v_event_voters wraps event_participants with the old schema
  EVENT_VOTERS: 'v_event_voters',
  EVENT_PARTICIPANTS: 'event_participants',
  INVITATIONS: 'invitations',
  POSITIONS: 'positions',
  CANDIDATES: 'candidates',
  CONTESTANTS: 'competition_contestants',
  CRITERIA: 'competition_criteria',
  JUDGE_SCORES: 'competition_scores',
  COMPETITION_CATEGORIES: 'competition_categories',
  COMPETITION_ROUNDS: 'competition_rounds',
  COMPETITION_ROUND_CONTESTANTS: 'competition_round_contestants',
  COMPETITION_ROUND_CRITERIA: 'competition_round_criteria',
  COMPETITION_JUDGES: 'competition_judges',
  COMPETITION_JUDGE_ASSIGNMENTS: 'competition_judge_assignments',
  SYSTEM_POLL_QUESTION_TYPES: 'system_poll_question_types',
  POLL_QUESTION_TYPES_REGISTRY: 'poll_question_types',
  POLL_QUESTION_TYPES_VIEW: 'v_poll_question_types',
  POLL_QUESTIONS: 'poll_questions',
  POLL_ANSWERS: 'poll_answers',
  PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  ELECTION_VOTES: 'election_votes',
  POLL_OPTIONS: 'poll_options',
  POLL_SUBMISSIONS: 'poll_submissions',
  SYSTEM_SETTINGS: 'system_settings',
  AUDIT_LOGS: 'audit_logs',
  NOTIFICATIONS: 'notifications',
  EVENT_DRAFTS: 'event_drafts',
  USER_SESSIONS: 'user_sessions',
  IMAGE_ASSETS: 'image_assets',
  IMAGE_DELETION_QUEUE: 'image_deletion_queue',
}

// Modules that support persistent Create-session drafts. Values match the
// frontend module strings and the /organizer/{module} route prefixes exactly.
export const DRAFT_MODULES = ['election', 'competition', 'polling']
