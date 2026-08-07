import { stringify } from 'csv-stringify/sync'
import { getOrganizersList, getGlobalEvents } from './admin.service.js'
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

export async function exportEventsCSV({ status } = {}) {
  const events = await getGlobalEvents()
  const filtered = status ? events.filter((e) => e.status === status) : events
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
