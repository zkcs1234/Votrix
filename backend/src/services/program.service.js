import { db as getClient } from '../foundation/db.js'
import { ApiError } from '../utils/ApiError.js'
import { DB_TABLES } from '../utils/constants.js'

// Valid student programs live in the `programs` table (migration 142). This is
// independent of the older participant taxonomy setting, which also carried
// Year & Section.

// Active program names in display order.
export async function listActivePrograms() {
  const { data, error } = await getClient()
    .from(DB_TABLES.PROGRAMS)
    .select('name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new ApiError(500, error.message)
  return (data ?? []).map((row) => row.name)
}
