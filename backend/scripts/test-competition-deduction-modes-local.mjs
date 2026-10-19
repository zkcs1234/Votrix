// Synthetic localhost fixture only. All function and fixture changes roll back.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const local = path.join(root, '.tmp/votrix-native-dev')
const identity = JSON.parse(readFileSync(path.join(local, 'identity.json'), 'utf8'))
assert.match(identity.database, /^votrix_dev_\d+$/)
assert.equal(identity.port, 55440)
const environment = { ...process.env, PGOPTIONS: '', PGCONNECT_TIMEOUT: '5' }
delete environment.PGSERVICE
delete environment.PGSERVICEFILE
const sql = source => {
  const result = spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe', ['-X', '-w', '-q', '-At', '-h', '127.0.0.1', '-p', '55440', '-U', 'postgres', '-d', identity.database, '-v', 'ON_ERROR_STOP=1'], { input: source, env: environment, encoding: 'utf8', windowsHide: true, timeout: 60000 })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return { output: result.stdout.trim(), notices: result.stderr.trim() }
}
const proof = JSON.parse(sql('SELECT votrix_local_identity()').output)
assert.equal(proof.nonce, identity.nonce)
assert.equal(Number(proof.port), 55440)
assert.equal(path.resolve(proof.dataDirectory).toLowerCase(), path.join(local, 'pgdata').toLowerCase())
const read = name => readFileSync(path.join(root, name), 'utf8')
const migration = name => read(`backend/src/database/migrations/${name}`).replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, '')
const alreadyUpgraded = sql("SELECT to_regprocedure('competition_child_native_deductions_enabled_v126(jsonb,uuid)') IS NOT NULL").output === 't'
const existing = alreadyUpgraded ? '' : migration('123_competition_configured_deduction_gate.sql')
const update = migration('124_competition_review_after_calculation.sql')
const setup = read('backend/__tests__/fixtures/competition-review-after-calculation-setup.sql')
const checks = read('backend/__tests__/fixtures/competition-review-after-calculation-assertions.sql')
const deductions = migration('126_competition_deduction_responsibility.sql')
const modeChecks=read('backend/__tests__/fixtures/competition-deduction-modes-assertions.sql')
const result = sql(`BEGIN; ${existing} ${setup} ${update} ${deductions} ${deductions} ${checks} ${modeChecks} ROLLBACK;`)
console.log(result.notices)
console.log('PASS migration rerun and database workflow assertions; all changes rolled back')
