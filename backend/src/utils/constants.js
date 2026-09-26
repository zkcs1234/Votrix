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

// Phase 6 — round progression.
export const ADVANCEMENT_TYPES = {
  NONE: 'none',
  TOP_N: 'top_n',
  TOP_PERCENT: 'top_percent',
  THRESHOLD: 'threshold',
  MANUAL: 'manual',
}

export const SCORE_POLICIES = {
  INDEPENDENT: 'independent',
  CUMULATIVE: 'cumulative',
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
  DIVISION: 'division',
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

// Account-level profile discriminator on `users` (migration 075).
// Distinct from PARTICIPANT_TYPES, which is the per-event enrollment role.
//   - STUDENT accounts may be enrolled as ELECTION_VOTER and/or POLLING_RESPONDENT.
//   - JUDGE accounts may be enrolled only as COMPETITION_JUDGE.
// The two pools never overlap (plan D6/D7).
export const PROFILE_TYPES = {
  STUDENT: 'student',
  JUDGE: 'judge',
}

// Which participant types each profile_type may be enrolled as (plan D7).
export const PROFILE_TYPE_PARTICIPANT_TYPES = {
  [PROFILE_TYPES.STUDENT]: [PARTICIPANT_TYPES.ELECTION_VOTER, PARTICIPANT_TYPES.POLLING_RESPONDENT],
  [PROFILE_TYPES.JUDGE]: [PARTICIPANT_TYPES.COMPETITION_JUDGE],
}

// system_settings key holding the admin-managed lists of valid Programs and
// Year & Sections for student participants (plan D13). Shape:
//   { programs: string[], sections: string[] }
export const PARTICIPANT_TAXONOMY_SETTING_KEY = 'participant_taxonomy'

// Organizer voter-scope types (organizer plan O3/O5). Stored on users.scope.
//   - ALL    → unrestricted (sees every program/section)
//   - SCOPED → limited to scope.programs (optionally narrowed by scope.sections)
export const ORGANIZER_SCOPE_TYPES = {
  ALL: 'all',
  SCOPED: 'scoped',
}

export const DB_TABLES = {
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  EVENTS: 'events',
  EVENT_PARTICIPANTS: 'event_participants',
  INVITATIONS: 'invitations',
  POSITIONS: 'positions',
  CANDIDATES: 'candidates',
  CONTESTANTS: 'competition_contestants',
  CRITERIA: 'competition_criteria',
  MINOR_CRITERIA: 'competition_minor_criteria',
  JUDGE_SCORES: 'competition_scores',
  COMPETITION_CATEGORIES: 'competition_categories',
  COMPETITION_ROUNDS: 'competition_rounds',
  COMPETITION_ROUND_CONTESTANTS: 'competition_round_contestants',
  COMPETITION_ROUND_CRITERIA: 'competition_round_criteria',
  COMPETITION_ROUND_RESULTS: 'competition_round_results',
  COMPETITION_JUDGES: 'competition_judges',
  COMPETITION_JUDGE_ASSIGNMENTS: 'competition_judge_assignments',
  COMPETITION_DIVISIONS: 'competition_divisions',
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
