import { createClient } from '@supabase/supabase-js'
import { env } from './env.js'

let supabase = null

export function getSupabase() {
  if (supabase) return supabase

  if (!env.supabase.url || !env.supabase.serviceRoleKey) {
    console.warn(
      '[database] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — database client unavailable',
    )
    return null
  }

  supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return supabase
}

export async function checkDatabaseConnection() {
  const client = getSupabase()
  if (!client) {
    return { connected: false, message: 'Supabase credentials not configured' }
  }

  const { error } = await client.from('users').select('id', { count: 'exact', head: true })

  if (error) {
    if (error.code === 'PGRST116' || error.code === '42P01') {
      return {
        connected: true,
        message: 'Supabase connected — run migrations/001_initial_schema.sql to create tables',
        schemaReady: false,
      }
    }
    return { connected: false, message: error.message, schemaReady: false }
  }

  return { connected: true, message: 'Supabase connected', schemaReady: true }
}
