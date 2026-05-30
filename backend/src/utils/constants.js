export const USER_ROLES = {
  ADMIN: 'admin',
  ORGANIZER: 'organizer',
  VOTER: 'voter',
}

export const ORG_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
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

export const EVENT_TYPES = {
  ELECTION: 'election',
  PAGEANT: 'pageant',
  POLLING: 'polling',
}

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
  CONTESTANTS: 'contestants',
  CRITERIA: 'criteria',
  JUDGE_SCORES: 'judge_scores',
  POLL_QUESTIONS: 'poll_questions',
  POLL_ANSWERS: 'poll_answers',
  PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  ELECTION_VOTES: 'election_votes',
  POLL_OPTIONS: 'poll_options',
  POLL_SUBMISSIONS: 'poll_submissions',
}
