import bcrypt from 'bcrypt'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const PLAIN = 'VotrixAdmin2026'
const USERNAME = 'admin'

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data, error } = await client
  .from('users')
  .select('id, username, email, role, account_status, password')
  .eq('username', USERNAME)
  .eq('role', 'admin')
  .maybeSingle()

if (error) {
  console.log('DB ERROR:', error.message)
  process.exit(1)
}

if (!data) {
  console.log('ROW NOT FOUND — username "' + USERNAME + '" does not exist with role=admin')
  process.exit(1)
}

console.log('FOUND ROW:')
console.log('  id:            ', data.id)
console.log('  username:      ', data.username)
console.log('  email:         ', data.email)
console.log('  role:          ', data.role)
console.log('  account_status:', data.account_status)
console.log('  password_len:  ', data.password ? data.password.length : 0)
console.log('  password_pre:  ', data.password ? data.password.slice(0, 7) : '(null)')

const matches = await bcrypt.compare(PLAIN, data.password)
console.log('BCRYPT COMPARE:', matches)
