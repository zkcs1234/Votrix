import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

console.log('SUPABASE_URL from .env:', process.env.SUPABASE_URL)
console.log('SERVICE_ROLE_KEY length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length)

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data, error } = await client
  .from('users')
  .select('id, username, email, role, account_status, length(password), substring(password, 1, 7)')
  .eq('username', 'admin')
  .eq('role', 'admin')
  .maybeSingle()

console.log('---')
if (error) {
  console.log('ERROR:', error.message)
} else if (!data) {
  console.log('NO ROW FOUND via API client')
} else {
  console.log('FOUND:')
  console.log('  username:', JSON.stringify(data.username))
  console.log('  email:', data.email)
  console.log('  role:', data.role)
  console.log('  account_status:', data.account_status)
  console.log('  password_length:', data['length(password)'])
  console.log('  password_prefix:', data['substring(password, 1, 7)'])
}
