import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data, error } = await client
  .from('users')
  .select('id, username, email, role, account_status')
  .order('created_at', { ascending: false })
  .limit(20)

console.log('Users in database:')
console.log(JSON.stringify(data, null, 2))
if (error) console.log('Error:', error.message)