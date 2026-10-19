import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

// Exercise the real loader in an isolated directory containing no credentials.
const fixture = mkdtempSync(path.join(tmpdir(), 'votrix-env-loader-'))
const backend = path.join(fixture, 'backend')
const config = path.join(backend, 'src/config/env.js')
mkdirSync(path.dirname(config), { recursive: true })
const source = readFileSync(new URL('../../src/config/env.js', import.meta.url), 'utf8')
  .replace("from 'dotenv'", `from '${import.meta.resolve('dotenv')}'`)
  .replace("from './trusted-origins.js'", `from '${new URL('../../src/config/trusted-origins.js', import.meta.url).href}'`)
writeFileSync(config, source)
writeFileSync(path.join(backend, '.env'), 'COMPETITION_CHILD_CONTEXTS_ENABLED=true\nCOMPETITION_NATIVE_SETUP_ENABLED=true\n')
writeFileSync(path.join(fixture, '.env'), 'COMPETITION_CHILD_CONTEXTS_ENABLED=false\n')

afterAll(() => {
  const target = path.resolve(fixture)
  if (!target.startsWith(path.join(path.resolve(tmpdir()), 'votrix-env-loader-'))) throw new Error('Invalid test cleanup path')
  rmSync(target, { recursive: true, force: true })
})

function flags(cwd, overrides = {}) {
  const context = new URL('../../src/modules/competition-context.js', import.meta.url).href
  const code = `await import(${JSON.stringify(pathToFileURL(config).href)});const {childCompetitionsEnabled}=await import(${JSON.stringify(context)});console.log(JSON.stringify({child:childCompetitionsEnabled(),setup:process.env.COMPETITION_NATIVE_SETUP_ENABLED==='true'}))`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd, env: { SystemRoot: process.env.SystemRoot, NODE_ENV: 'development', ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 10000 })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
}

test('repository-root launch loads backend .env instead of an unrelated root .env', () => {
  expect(flags(fixture)).toEqual({ child: true, setup: true })
})
test('backend-directory launch resolves the same feature flags', () => {
  expect(flags(backend)).toEqual({ child: true, setup: true })
})
test('hosting environment can still explicitly disable a feature', () => {
  expect(flags(fileURLToPath(new URL('../..', import.meta.url)), { COMPETITION_CHILD_CONTEXTS_ENABLED: 'false' })).toEqual({ child: false, setup: true })
})
