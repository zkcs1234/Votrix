import { asyncHandler } from '../utils/asyncHandler.js'
import { createOrganizer } from '../services/user.service.js'
import { validateCreateOrganizer } from '../validators/auth.validator.js'
import { getAdminDashboardStats, getAdminAnalytics } from '../services/dashboard.service.js'
import { ACCOUNT_STATUS } from '../utils/constants.js'
import {
  getOrganizersList,
  getGlobalEvents as fetchGlobalEvents,
  getSystemSettings as fetchSystemSettings,
  saveSystemSetting,
  getAuditLogs as fetchAuditLogs,
  createAuditLog,
  updateOrganizerAccountStatus,
  sendOnboardingNotification,
  getOrganizerActivity as fetchOrganizerActivity,
} from '../services/admin.service.js'
import { createAdminAlert, createNotification } from '../services/notification.service.js'
import { exportOrganizersCSV, exportEventsCSV, exportAuditLogsCSV } from '../services/export.service.js'
import { checkSystemHealth } from '../services/health.service.js'
import { getAlertConfig as fetchAlertConfig, updateAlertConfig as saveAlertConfig } from '../services/alert.service.js'
import {
  getParticipantTaxonomy as fetchParticipantTaxonomy,
  updateParticipantTaxonomy as saveParticipantTaxonomy,
} from '../services/participant-taxonomy.service.js'
import {
  listVoters as fetchVoters,
  createVoter as createVoterAccount,
  updateVoter as updateVoterProfile,
  updateVoterStatus as updateVoterAccountStatus,
  previewVoterImport,
  registerVoterImport,
  VOTER_CSV_TEMPLATE_HEADERS,
  listJudges as fetchJudges,
  createJudge as createJudgeAccount,
  updateJudge as updateJudgeProfile,
  updateJudgeStatus as updateJudgeAccountStatus,
  previewJudgeImport,
  registerJudgeImport,
  JUDGE_CSV_TEMPLATE_HEADERS,
} from '../services/admin-participant.service.js'
import {
  listAdminSessions,
  listSessionsForUser,
  revokeSession,
  revokeAllSessionsForUser,
} from '../services/session.service.js'
import { platformSearch } from '../services/search.service.js'
import {
  getArchivalPolicy as fetchArchivalPolicy,
  updateArchivalPolicy as saveArchivalPolicy,
  runArchivalNow as triggerArchival,
} from '../services/archival.service.js'
import { ApiError } from '../utils/ApiError.js'
import { validateUUID } from '../utils/sanitize.js'

// CWE-20: Allowlist for system setting keys — alphanumeric + underscores only.
const SETTING_KEY_RE = /^[a-zA-Z0-9_]{1,100}$/

function isSerializableSettingValue(value) {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isSerializableSettingValue)
  }
  if (typeof value === 'object') {
    return Object.values(value).every((entry) => isSerializableSettingValue(entry))
  }
  return false
}

function validateSystemSetting(body) {
  const { key, value, description } = body ?? {}
  if (!key || value === undefined) {
    throw new ApiError(400, 'Key and value are required')
  }
  if (typeof key !== 'string' || !SETTING_KEY_RE.test(key)) {
    throw new ApiError(400, 'Setting key must be alphanumeric with underscores only (max 100 chars)')
  }
  if (typeof description === 'string' && description.length > 500) {
    throw new ApiError(400, 'Description must be 500 characters or fewer')
  }
  if (!isSerializableSettingValue(value)) {
    throw new ApiError(400, 'Setting value must be a JSON-serializable primitive or object')
  }
  return { key, value, description }
}

export const createOrganizerAccount = asyncHandler(async (req, res) => {
  const payload = validateCreateOrganizer(req.body)
  const { user, email } = await createOrganizer({
    email: payload.email,
    // Password is auto-generated inside createOrganizer and emailed to the
    // organizer — the admin never sets or sees it.
    mustChangePassword: true,
    sendInvitationEmail: req.body?.sendEmail !== false,
  })

  // Log the action
  await createAuditLog({
    userId: req.user.id,
    action: 'CREATE_ORGANIZER',
    entity: 'users',
    entityId: user.id,
    details: { email: user.email }
  })

  res.status(201).json({
    success: true,
    message: 'Organizer account created and ready for use',
    user,
    email,
  })
})

export const updateOrganizerStatus = asyncHandler(async (req, res) => {
  const organizerId = validateUUID(req.params.organizerId, 'organizerId')
  const { accountStatus } = req.body ?? {}

  if (!Object.values(ACCOUNT_STATUS).includes(accountStatus)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid account status',
    })
  }

  const updatedOrganizer = await updateOrganizerAccountStatus(organizerId, accountStatus)

  await createNotification({
    userId: updatedOrganizer.id,
    type: 'organizer.status',
    title: 'Your organizer account status changed',
    message:
      accountStatus === 'active'
        ? 'Your account has been reactivated. You can now access the organizer dashboard.'
        : accountStatus === 'suspended'
          ? 'Your account has been suspended. Access is temporarily disabled.'
          : 'Your account status has been updated.',
    actionUrl: '/notifications',
    entity: 'users',
    entityId: updatedOrganizer.id,
    metadata: { accountStatus },
  })

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_ORGANIZER_STATUS',
    entity: 'users',
    entityId: updatedOrganizer.id,
    details: {
      email: updatedOrganizer.email,
      accountStatus: updatedOrganizer.account_status,
    },
  })

  res.json({
    success: true,
    message: 'Organizer status updated',
    organizer: updatedOrganizer,
  })
})

export const getOrganizers = asyncHandler(async (_req, res) => {
  const organizers = await getOrganizersList()
  res.json({ success: true, organizers })
})

export const getGlobalEvents = asyncHandler(async (_req, res) => {
  const events = await fetchGlobalEvents()
  res.json({ success: true, events })
})

export const getSystemSettings = asyncHandler(async (_req, res) => {
  const settings = await fetchSystemSettings()
  res.json({ success: true, settings })
})

export const updateSystemSettings = asyncHandler(async (req, res) => {
  const { key, value, description } = validateSystemSetting(req.body)

  const updatedSetting = await saveSystemSetting(key, value, description)

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_SYSTEM_SETTING',
    entity: 'system_settings',
    entityId: updatedSetting.id,
    details: { key }
  })

  res.json({ success: true, setting: updatedSetting })
})

export const sendOrganizerOnboarding = asyncHandler(async (req, res) => {
  const organizerId = validateUUID(req.params.organizerId, 'organizerId')

  const result = await sendOnboardingNotification(organizerId)

  await createAuditLog({
    userId: req.user.id,
    action: 'SEND_ONBOARDING_NOTIFICATION',
    entity: 'users',
    entityId: organizerId,
    details: { emailNotification: result.email },
  })

  res.json({
    success: true,
    message: 'Onboarding notification sent',
    ...result,
  })
})

export const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    page = '1',
    limit = '50',
    search = '',
    action,
    entity,
    startDate,
    endDate,
  } = req.query ?? {}

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200)
  const safePage  = Math.max(1, parseInt(page, 10) || 1)
  const offset    = (safePage - 1) * safeLimit

  const { logs, total } = await fetchAuditLogs({
    search: search || undefined,
    action: action || undefined,
    entity: entity || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: safeLimit,
    offset,
  })

  res.json({
    success: true,
    logs,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  })
})

export const getOrganizerActivity = asyncHandler(async (req, res) => {
  const { organizerId } = req.params
  const { limit = '50', page = '1', action, entity } = req.query
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200)
  const safePage = Math.max(1, parseInt(page, 10) || 1)
  const offset = (safePage - 1) * safeLimit
  const { logs, total } = await fetchOrganizerActivity(organizerId, {
    limit: safeLimit,
    offset,
    action: action || undefined,
    entity: entity || undefined,
  })
  res.json({
    success: true,
    logs,
    pagination: { total, page: safePage, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) },
  })
})

export const exportOrganizersData = asyncHandler(async (req, res) => {
  const csv = await exportOrganizersCSV()
  await createAuditLog({ userId: req.user.id, action: 'EXPORT_ORGANIZERS', entity: 'users' })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="organizers.csv"')
  res.send(csv)
})

export const exportEventsData = asyncHandler(async (req, res) => {
  const csv = await exportEventsCSV({ status: req.query.status })
  await createAuditLog({
    userId: req.user.id,
    action: 'EXPORT_EVENTS',
    entity: 'events',
    details: { status: req.query.status ?? null },
  })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="events.csv"')
  res.send(csv)
})

export const exportAuditLogsData = asyncHandler(async (req, res) => {
  const csv = await exportAuditLogsCSV({ startDate: req.query.startDate, endDate: req.query.endDate })
  await createAuditLog({
    userId: req.user.id,
    action: 'EXPORT_AUDIT_LOGS',
    entity: 'audit_logs',
    details: { startDate: req.query.startDate ?? null, endDate: req.query.endDate ?? null },
  })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  res.send(csv)
})

export const getSystemHealth = asyncHandler(async (_req, res) => {
  const health = await checkSystemHealth()
  res.json({ success: true, ...health })
})

export const getAlertConfig = asyncHandler(async (_req, res) => {
  const config = await fetchAlertConfig()
  res.json({ success: true, config })
})

export const updateAlertConfig = asyncHandler(async (req, res) => {
  const config = await saveAlertConfig(req.body)
  res.json({ success: true, config })
})

export const getParticipantTaxonomy = asyncHandler(async (_req, res) => {
  const taxonomy = await fetchParticipantTaxonomy()
  res.json({ success: true, taxonomy })
})

export const updateParticipantTaxonomy = asyncHandler(async (req, res) => {
  const taxonomy = await saveParticipantTaxonomy(req.body)

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_PARTICIPANT_TAXONOMY',
    entity: 'system_settings',
    details: { programs: taxonomy.programs.length, sections: taxonomy.sections.length },
  })

  res.json({ success: true, taxonomy })
})

// ---------------------------------------------------------------------------
// Voter (student participant) registration — plan Phase 3
// ---------------------------------------------------------------------------
export const getVoters = asyncHandler(async (req, res) => {
  const { search, program, yearSection, status, page, limit } = req.query ?? {}
  const result = await fetchVoters({ search, program, yearSection, status, page, limit })
  res.json({ success: true, ...result })
})

export const createVoter = asyncHandler(async (req, res) => {
  const { user, email } = await createVoterAccount(req.body)

  await createAuditLog({
    userId: req.user.id,
    action: 'CREATE_VOTER',
    entity: 'users',
    entityId: user.id,
    details: { email: user.email, emailSent: Boolean(email?.sent) },
  })

  res.status(201).json({ success: true, user, email })
})

export const updateVoter = asyncHandler(async (req, res) => {
  const userId = validateUUID(req.params.userId, 'userId')
  const { user } = await updateVoterProfile(userId, req.body)

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_VOTER',
    entity: 'users',
    entityId: userId,
    details: { schoolId: user.schoolId },
  })

  res.json({ success: true, user })
})

export const updateVoterStatus = asyncHandler(async (req, res) => {
  const userId = validateUUID(req.params.userId, 'userId')
  const { accountStatus } = req.body ?? {}
  const { user } = await updateVoterAccountStatus(userId, accountStatus)

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_VOTER_STATUS',
    entity: 'users',
    entityId: userId,
    details: { accountStatus },
  })

  res.json({ success: true, user })
})

export const previewVotersCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'CSV file required')
  const result = await previewVoterImport(req.file.buffer)
  res.json({ success: true, ...result })
})

export const registerVotersCsv = asyncHandler(async (req, res) => {
  const { data } = req.body
  if (!data || !Array.isArray(data)) throw new ApiError(400, 'Invalid import data')

  const result = await registerVoterImport(data)

  await createAuditLog({
    userId: req.user.id,
    action: 'IMPORT_VOTERS',
    entity: 'users',
    details: { total: result.total, succeeded: result.succeeded, failed: result.failed },
  })

  res.json({ success: true, ...result })
})

export const getVoterCsvTemplate = asyncHandler(async (_req, res) => {
  const header = VOTER_CSV_TEMPLATE_HEADERS.join(',')
  const example = ['voter@example.com', '2021-00123', 'Dela Cruz', 'Juan', 'BSIT', '3-A'].join(',')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="voter-template.csv"')
  res.send(`${header}\n${example}\n`)
})

// ---------------------------------------------------------------------------
// Judge registration — plan Phase 4
// ---------------------------------------------------------------------------
export const getJudges = asyncHandler(async (req, res) => {
  const { search, status, page, limit } = req.query ?? {}
  const result = await fetchJudges({ search, status, page, limit })
  res.json({ success: true, ...result })
})

export const createJudge = asyncHandler(async (req, res) => {
  const { user, email } = await createJudgeAccount(req.body)

  await createAuditLog({
    userId: req.user.id,
    action: 'CREATE_JUDGE',
    entity: 'users',
    entityId: user.id,
    details: { email: user.email, emailSent: Boolean(email?.sent) },
  })

  res.status(201).json({ success: true, user, email })
})

export const updateJudge = asyncHandler(async (req, res) => {
  const userId = validateUUID(req.params.userId, 'userId')
  const { user } = await updateJudgeProfile(userId, req.body)

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_JUDGE',
    entity: 'users',
    entityId: userId,
    details: {},
  })

  res.json({ success: true, user })
})

export const updateJudgeStatus = asyncHandler(async (req, res) => {
  const userId = validateUUID(req.params.userId, 'userId')
  const { accountStatus } = req.body ?? {}
  const { user } = await updateJudgeAccountStatus(userId, accountStatus)

  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_JUDGE_STATUS',
    entity: 'users',
    entityId: userId,
    details: { accountStatus },
  })

  res.json({ success: true, user })
})

export const previewJudgesCsv = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'CSV file required')
  const result = await previewJudgeImport(req.file.buffer)
  res.json({ success: true, ...result })
})

export const registerJudgesCsv = asyncHandler(async (req, res) => {
  const { data } = req.body
  if (!data || !Array.isArray(data)) throw new ApiError(400, 'Invalid import data')

  const result = await registerJudgeImport(data)

  await createAuditLog({
    userId: req.user.id,
    action: 'IMPORT_JUDGES',
    entity: 'users',
    details: { total: result.total, succeeded: result.succeeded, failed: result.failed },
  })

  res.json({ success: true, ...result })
})

export const getJudgeCsvTemplate = asyncHandler(async (_req, res) => {
  const header = JUDGE_CSV_TEMPLATE_HEADERS.join(',')
  const example = ['judge@example.com', 'Reyes', 'Maria', 'Prof.', 'College of Engineering', 'Robotics'].join(',')
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="judge-template.csv"')
  res.send(`${header}\n${example}\n`)
})

export const getAdminOverview = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    message: 'Admin area — more features in later phases',
  })
})

export const getDashboard = asyncHandler(async (_req, res) => {
  const dashboard = await getAdminDashboardStats()
  res.json({ success: true, ...dashboard })
})

export const getAnalytics = asyncHandler(async (_req, res) => {
  const analytics = await getAdminAnalytics()
  res.json({ success: true, ...analytics })
})

export const listSessions = asyncHandler(async (req, res) => {
  const { userId, limit } = req.query ?? {}
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500)
  const sessions = userId
    ? await listSessionsForUser(userId, { limit: safeLimit })
    : await listAdminSessions({ limit: safeLimit })
  res.json({ success: true, sessions })
})

export const revokeOneSession = asyncHandler(async (req, res) => {
  const sessionId = validateUUID(req.params.sessionId, 'sessionId')
  const result = await revokeSession(sessionId)
  await createAuditLog({
    userId: req.user.id,
    action: 'REVOKE_SESSION',
    entity: 'user_sessions',
    entityId: result?.id,
    details: { revokedUserId: result?.user_id },
  })
  res.json({ success: true, message: 'Session revoked' })
})

export const revokeAllForUser = asyncHandler(async (req, res) => {
  const userId = validateUUID(req.params.userId, 'userId')
  const exceptSessionId = req.query?.exceptSessionId || null
  const { revokedCount } = await revokeAllSessionsForUser(userId, { exceptSessionId })
  await createAuditLog({
    userId: req.user.id,
    action: 'REVOKE_ALL_SESSIONS',
    entity: 'users',
    entityId: userId,
    details: { revokedCount, exceptSessionId },
  })
  res.json({ success: true, revokedCount })
})

export const platformSearchHandler = asyncHandler(async (req, res) => {
  const { q = '', type = 'all', limit } = req.query ?? {}
  const query = String(q).trim()
  if (!query) {
    return res.json({ success: true, results: { organizers: [], events: [] } })
  }
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 50)
  const results = await platformSearch(query, { type, limit: safeLimit })
  res.json({ success: true, results })
})

export const getArchivalPolicy = asyncHandler(async (_req, res) => {
  const policy = await fetchArchivalPolicy()
  res.json({ success: true, policy })
})

export const updateArchivalPolicy = asyncHandler(async (req, res) => {
  const policy = await saveArchivalPolicy(req.body)
  await createAuditLog({
    userId: req.user.id,
    action: 'UPDATE_ARCHIVAL_POLICY',
    entity: 'system_settings',
    details: { policy },
  })
  res.json({ success: true, policy })
})

export const runArchivalNow = asyncHandler(async (req, res) => {
  const result = await triggerArchival()
  await createAuditLog({
    userId: req.user.id,
    action: 'RUN_EVENT_ARCHIVAL',
    entity: 'events',
    details: result,
  })
  res.json({ success: true, ...result })
})
