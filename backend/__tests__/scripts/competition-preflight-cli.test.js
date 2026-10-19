import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { expect, test } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const script = path.join(root, 'scripts/competition-preflight.mjs')
const run = args => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', timeout: 10000 })

test('help works without app startup, credentials or a database connection', () => {
  const result = run(['--help'])
  expect(result.status).toBe(0)
  expect(result.stdout).toContain('read only')
  expect(result.stderr).toBe('')
})

test.each([
  [[], 'Choose exactly one'],
  [['--supabase', '--postgres', '--output', 'audits/unused.json'], 'Choose exactly one'],
  [['--supabase', '--output', '../outside.json'], 'inside this workspace'],
  [['--supabase', '--output', 'audits/unused.json', '--max-rows', '0'], 'max-rows'],
  [['--supabase', '--output', 'audits/unused.json'], 'explicitly selected env-file'],
  [['--postgres', '--output', 'audits/unused.json'], 'explicit host'],
  [['--postgres', '--host', '127.0.0.1', '--port', '55439', '--database', 'postgresql://secret:password@localhost/db', '--username', 'postgres', '--output', 'audits/unused.json'], 'database name'],
  [['--supabase', '--output', 'audits/unused.json', '--baseline', 'audits/unused.json'], 'overwrite the baseline'],
  [['--apply', '--output', 'audits/unused.json'], 'Unknown or duplicate'],
])('invalid inspection options fail before any database operation: %j', (args, message) => {
  const result = run(args)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain(message)
  expect(result.stdout).toBe('')
  expect(result.stderr).not.toContain('secret:password')
})
