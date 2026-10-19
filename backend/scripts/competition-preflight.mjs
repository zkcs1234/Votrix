// Explicit read-only inspection. Never imports the app, calls an RPC, sends
// invitations, loads .env implicitly, runs a migration, or repairs a record.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'
import { analyzeCompetitionPreflight, COMPETITION_TABLES, fingerprint, compareHistoricalInventory } from '../src/modules/competition-legacy-preflight.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const help = `Competition Phase 1 preflight (read only)
  node backend/scripts/competition-preflight.mjs --supabase --env-file backend/.env --output audits/<new-report>.json
  node backend/scripts/competition-preflight.mjs --postgres --host 127.0.0.1 --port 55439 --database <name> --username postgres --output audits/<new-report>.json
Options: --psql <executable>, --max-rows 20000, --baseline <prior-report.json>
No migrations or RPCs are executed. PostgreSQL uses a repeatable-read, read-only transaction.
REST observations are not a transactional snapshot; catalog/ACL checks remain unverified.
Reports contain metadata, counts, hashes and diagnostic IDs, never raw score sheets or credentials.
Exit: 0 inspection with no blockers; 2 report has blockers; 1 inspection failed.`
const options = {}
const flags = new Set(['supabase', 'postgres', 'help'])
const values = new Set(['env-file', 'output', 'host', 'port', 'database', 'username', 'psql', 'max-rows', 'baseline'])
function safePath(value) {
  const resolved = path.resolve(root, value), relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Report files must be inside this workspace')
  return resolved
}
function validateOptions() {
  for (let i = 0; i < args.length; i++) {
    const name = args[i].slice(2)
    if (!args[i].startsWith('--') || (!flags.has(name) && !values.has(name)) || Object.hasOwn(options, name)) throw new Error('Unknown or duplicate option; use --help')
    if (flags.has(name)) options[name] = true
    else { if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Option value required'); options[name] = args[++i] }
  }
  if (options.help) return
  if (Boolean(options.supabase) === Boolean(options.postgres) || !options.output) throw new Error('Choose exactly one inspection mode and an output file')
  options.maxRows = Number(options['max-rows'] ?? 20000)
  if (!Number.isSafeInteger(options.maxRows) || options.maxRows < 1 || options.maxRows > 100000) throw new Error('max-rows must be 1-100000')
  options.output = safePath(options.output)
  if (options.baseline && safePath(options.baseline) === options.output) throw new Error('Do not overwrite the baseline report')
}

async function collectRest() {
  if (!options['env-file']) throw new Error('Supabase requires an explicitly selected env-file')
  const config = parse(await readFile(path.resolve(root, options['env-file'])))
  const base = new URL(config.SUPABASE_URL)
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('A credential-free HTTPS Supabase URL is required')
  const key = config.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Service-role credential is missing from the selected env-file')
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  async function get(url, extra = {}) {
    try { return await fetch(url, { headers: { ...headers, ...extra }, signal: AbortSignal.timeout(30000), redirect: 'error' }) }
    catch { throw new Error('Read-only Supabase request failed; credentials and record contents were not logged') }
  }
  const response = await get(new URL('/rest/v1/', base), { Accept: 'application/openapi+json' })
  if (!response.ok) throw new Error(`Schema inspection failed: HTTP ${response.status}`)
  const openapi = await response.json()
  const schema = { tables: {}, functions: Object.keys(openapi.paths ?? {}).filter(p => p.startsWith('/rpc/')).map(p => p.slice(5)) }
  const records = {}, inspections = {}
  for (const table of COMPETITION_TABLES) {
    const definition = openapi.definitions?.[table]
    if (!definition) continue
    schema.tables[table] = { columns: Object.keys(definition.properties ?? {}) }
    records[table] = []
    let count = null, complete = false
    // Page using server Content-Range rather than assuming the project's row cap.
    for (let offset = 0; offset <= options.maxRows;) {
      const url = new URL(`/rest/v1/${table}`, base)
      url.searchParams.set('select', '*')
      const order = schema.tables[table].columns.includes('id') ? 'id.asc' : schema.tables[table].columns.includes('session_id') ? `session_id.asc,judge_id.asc${schema.tables[table].columns.includes('entry_id')?',entry_id.asc,criterion_id.asc':''}` : schema.tables[table].columns.includes('competition_id') ? table==='competition_legacy_contexts'?'event_id.asc':'competition_id.asc' : schema.tables[table].columns.includes('round_id') ? 'round_id.asc,contestant_id.asc' : 'organizer_id.asc,request_id.asc'
      url.searchParams.set('order', table === 'competition_round_criteria' ? 'round_id.asc,criteria_id.asc' : order)
      if (table === 'events') url.searchParams.set('event_type', 'in.(competition_scoring,pageant)')
      if (table === 'event_participants') url.searchParams.set('participant_type', 'eq.COMPETITION_JUDGE')
      const result = await get(url, { Prefer: 'count=exact', 'Range-Unit': 'items', Range: `${offset}-${Math.min(offset + 499, options.maxRows)}` })
      if (!result.ok) { inspections[table] = { complete: false, reason: `HTTP ${result.status}` }; break }
      const range = /^(\d+)-(\d+)\/(\d+)$|^\*\/(\d+)$/.exec(result.headers.get('content-range') ?? '')
      const page = await result.json()
      if (!Array.isArray(page) || !range) { inspections[table] = { complete: false, reason: 'Exact pagination metadata unavailable' }; break }
      const pageCount = Number(range[3] ?? range[4])
      if (count != null && count !== pageCount) { inspections[table] = { complete: false, reason: 'Row count changed during REST inspection' }; break }
      count = pageCount
      if (count > options.maxRows) { inspections[table] = { count, complete: false, reason: 'Row inspection limit exceeded; increase max-rows or use PostgreSQL' }; break }
      if (page.length && (Number(range[1]) !== offset || Number(range[2]) - offset + 1 !== page.length)) { inspections[table] = { complete: false, reason: 'Unexpected pagination range' }; break }
      records[table].push(...page)
      offset += page.length
      if (offset === count) { complete = true; break }
      if (!page.length) { inspections[table] = { complete: false, reason: 'Truncated REST inventory' }; break }
    }
    inspections[table] ??= { count, complete }
  }
  return { schema, records, inspections, metadata: null, consistency: 'REST observations; concurrent writes may occur between requests', target: { kind: 'configured_supabase', host: base.hostname } }
}

async function collectPostgres() {
  for (const name of ['host', 'port', 'database', 'username']) if (!options[name] || options[name].startsWith('-') || /[\r\n\0]/.test(options[name])) throw new Error('PostgreSQL requires explicit host, port, database and username')
  if (!/^\d+$/.test(options.port) || Number(options.port) < 1 || Number(options.port) > 65535) throw new Error('Invalid PostgreSQL port')
  if (/[=\s:/]/.test(options.database)) throw new Error('Use a database name, not a connection string')
  const executable = options.psql ?? (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe' : 'psql')
  const env = { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000 -c row_security=off', PGCONNECT_TIMEOUT: '10' }
  delete env.PGSERVICE; delete env.PGSERVICEFILE
  function read(sql) {
    const result = spawnSync(executable, ['-X', '-w', '-q', '-A', '-t', '-h', options.host, '-p', options.port, '-d', options.database, '-U', options.username, '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', env, timeout: 60000, maxBuffer: 128 * 1024 * 1024 })
    if (result.status !== 0) throw new Error('PostgreSQL read-only inspection failed; check connection, permissions and limits. No SQL error payload was logged.')
    return result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  }
  const catalog = await readFile(path.join(root, 'backend/src/database/scripts/competition-preflight-catalog.sql'), 'utf8')
  const [discovery] = read(`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${catalog}\nROLLBACK;`)
  const statements = []
  for (const table of COMPETITION_TABLES.filter(t => discovery.tables[t])) {
    // Names are fixed allowlisted identifiers; no CLI text enters SQL.
    const columns = discovery.tables[table].columns
    let where = ''
    if (table === 'events') where = "WHERE event_type::text IN ('competition_scoring','pageant')"
    if (table === 'event_participants') where = "WHERE participant_type::text='COMPETITION_JUDGE'"
    // Competition tables are already module-specific. Keep even bad historical
    // links so the auditor can detect them rather than silently filtering them.
    const order = columns.includes('id') ? 'id' : columns.includes('session_id') ? `session_id,judge_id${columns.includes('entry_id')?',entry_id,criterion_id':''}` : columns.includes('competition_id') ? table==='competition_legacy_contexts'?'event_id':'competition_id' : columns.includes('round_id') ? `round_id,${columns.includes('criteria_id') ? 'criteria_id' : 'contestant_id'}` : 'organizer_id,request_id'
    statements.push(`SELECT jsonb_build_object('table','${table}','count',(SELECT count(*) FROM public.${table} ${where}),'rows',coalesce(jsonb_agg(to_jsonb(t) ORDER BY ${order}),'[]'),'losslessMd5',md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY ${order}),''))) FROM (SELECT * FROM public.${table} ${where} ORDER BY ${order} LIMIT ${options.maxRows + 1}) t;`)
  }
  const [current, ...data] = read(`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${catalog}\n${statements.join('\n')}\nROLLBACK;`)
  if (fingerprint(discovery) !== fingerprint(current)) throw new Error('Database metadata changed during inspection; repeat preflight')
  const records = {}, inspections = {}
  for (const result of data) {
    records[result.table] = result.rows
    inspections[result.table] = { count: result.count, complete: result.count === result.rows.length && result.count <= options.maxRows, fingerprint: `postgres-jsonb-md5:${result.losslessMd5}`, reason: result.count > options.maxRows ? 'Row inspection limit exceeded' : undefined }
  }
  return { schema: { tables: current.tables, functions: current.functions }, records, inspections, metadata: current.metadata, consistency: 'PostgreSQL repeatable-read READ ONLY snapshot; ROLLBACK; row_security=off fails on hidden rows', target: { kind: 'postgresql', host: options.host, port: options.port, database: options.database } }
}

try {
  validateOptions()
  if (options.help) console.log(help)
  else {
    const collected = options.supabase ? await collectRest() : await collectPostgres()
    const directory = path.join(root, 'backend/src/database/migrations')
    const migrationFiles = (await readdir(directory)).filter(name => name.endsWith('.sql') && !/down/i.test(name) && /competition|pageant|stage_group|round_advancement|minor_criteria|judge_assignment|098_repair_event_participants/.test(name)).sort()
    const migrationSources = []
    for (const filename of migrationFiles) migrationSources.push({ filename, sourceSha256: createHash('sha256').update(await readFile(path.join(directory, filename))).digest('hex'), executed: false })
    const report = { ...analyzeCompetitionPreflight(collected), checkedAt: new Date().toISOString(), target: collected.target, consistency: collected.consistency, migrationSources }
    if (options.baseline) {
      const baseline = JSON.parse(await readFile(safePath(options.baseline), 'utf8'))
      if (baseline.format !== report.format || fingerprint(baseline.target) !== fingerprint(report.target) || baseline.consistency !== report.consistency) throw new Error('Baseline must use the same target, format and inspection mode')
      report.comparison = compareHistoricalInventory(baseline, report)
    }
    await mkdir(path.dirname(options.output), { recursive: true })
    // A saved baseline is never replaced accidentally. Pick a new report name.
    await writeFile(options.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ report: path.relative(root, options.output), readOnly: true, tables: Object.keys(report.inventory).length, blockers: report.blockers, reviewItems: report.reviewItems, historicalResults: report.historicalResults, comparison: report.comparison ?? null, migrationApproved: false }, null, 2))
    process.exitCode = report.blockers || report.comparison && !report.comparison.unchanged ? 2 : 0
  }
} catch (error) {
  // Error text is ours, except local file errors; never print request headers,
  // environment variables, SQL stderr, returned record data or a stack trace.
  console.error(error instanceof SyntaxError || error instanceof TypeError ? 'Preflight failed: invalid configuration or response; no contents logged' : error.code ? `Preflight failed: ${error.code}` : error.message)
  process.exitCode = 1
}
