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
const setup=read('backend/__tests__/fixtures/pageant-division-tabulation-setup.sql')
const checks=read('backend/__tests__/fixtures/pageant-division-tabulation-assertions.sql')
const update=migration('130_pageant_division_tabulation.sql')
const result=sql(`BEGIN; ${migration('127_competition_idempotent_auto_calculation.sql')} ${setup} ${update} ${update} ${checks} ROLLBACK;`)
console.log(result.notices)
console.log('PASS Pageant division migration, source fingerprints, guards, advancement and immutable history; all changes rolled back')
