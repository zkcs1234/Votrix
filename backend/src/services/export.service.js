import { stringify } from 'csv-stringify/sync'
import { getOrganizersList, getGlobalEvents } from './admin.service.js'
import { listVoters, listJudges } from './admin-participant.service.js'
import { listAuditTrail } from '../foundation/audit.js'

function toCSV(rows, columns) {
  return stringify(rows, { header: true, columns })
}

export async function exportOrganizersCSV() {
  const organizers = await getOrganizersList()
  return toCSV(organizers, [
    { key: 'email', header: 'email' },
    { key: 'organization_name', header: 'organization_name' },
    { key: 'organizer_name', header: 'organizer_name' },
    { key: 'position', header: 'position' },
    { key: 'account_status', header: 'account_status' },
    { key: 'profile_complete', header: 'profile_complete' },
    { key: 'created_at', header: 'created_at' },
  ])
}

async function listAllParticipants(listPage, key) {
  const rows = []
  let page = 1
  let total = 0

  do {
    const result = await listPage({ page, limit: 200 })
    const pageRows = result[key] ?? []
    if (!pageRows.length) break
    rows.push(...pageRows)
    total = result.total
    page += 1
  } while (rows.length < total)

  return rows
}

export async function exportVotersCSV() {
  const voters = await listAllParticipants(listVoters, 'voters')
  return toCSV(voters, [
    { key: 'email', header: 'email' },
    { key: 'schoolId', header: 'school_id' },
    { key: 'firstName', header: 'first_name' },
    { key: 'lastName', header: 'last_name' },
    { key: 'program', header: 'program' },
    { key: 'yearSection', header: 'year_section' },
    { key: 'accountStatus', header: 'account_status' },
    { key: 'createdAt', header: 'created_at' },
  ])
}

export async function exportJudgesCSV() {
  const judges = await listAllParticipants(listJudges, 'judges')
  const rows = judges.map((judge) => ({
    ...judge,
    expertise: judge.profileData?.expertise,
  }))
  return toCSV(rows, [
    { key: 'email', header: 'email' },
    { key: 'firstName', header: 'first_name' },
    { key: 'lastName', header: 'last_name' },
    { key: 'expertise', header: 'expertise' },
    { key: 'accountStatus', header: 'account_status' },
    { key: 'createdAt', header: 'created_at' },
  ])
}

function eventMatchesType(eventType, type) {
  if (!type || type === 'all') return true
  if (type === 'competition') return eventType === 'competition_scoring' || eventType === 'pageant'
  return eventType === type
}

export async function exportEventsCSV({ status, type, search } = {}) {
  const events = await getGlobalEvents()
  const searchTerm = String(search ?? '').trim().toLowerCase()
  const filtered = events.filter((event) => {
    if (status && status !== 'all' && event.status !== status) return false
    if (!eventMatchesType(event.event_type, type)) return false
    if (searchTerm) {
      const title = event.title?.toLowerCase() ?? ''
      const organization = event.organizations?.organization_name?.toLowerCase() ?? ''
      if (!title.includes(searchTerm) && !organization.includes(searchTerm)) return false
    }
    return true
  })
  return toCSV(filtered, [
    { key: 'title', header: 'title' },
    { key: 'event_type', header: 'event_type' },
    { key: 'status', header: 'status' },
    { key: 'start_date', header: 'start_date' },
    { key: 'end_date', header: 'end_date' },
    { key: 'created_at', header: 'created_at' },
  ])
}

export async function exportAuditLogsCSV({ startDate, endDate } = {}) {
  const { rows } = await listAuditTrail({ startDate, endDate, limit: 10000, offset: 0 })
  return toCSV(rows, [
    { key: 'created_at', header: 'created_at' },
    { key: 'action', header: 'action' },
    { key: 'entity', header: 'entity' },
    { key: 'entity_id', header: 'entity_id' },
    { key: 'user_id', header: 'user_id' },
    { key: 'details', header: 'details' },
  ])
}
