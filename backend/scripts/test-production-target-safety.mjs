// Target verified: NONE. Pure assertion tests; no backend/DB/provider imports.
import assert from 'node:assert/strict'
import {writeFileSync,mkdirSync} from 'node:fs'
import path from 'node:path'
import {classifySupabaseTarget,assertDisposablePostgres,assertBackendStartAllowed} from './production-target-safety.mjs'
const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'audits/competition-phase10-2026-10-14'),checks=[]
const check=(name,fn)=>{fn();checks.push(name)}
check('Unidentified URL fails closed',()=>assert.equal(classifySupabaseTarget(undefined).writableAllowed,false))
check('Hosted Supabase is production sensitive',()=>assert.equal(classifySupabaseTarget('https://synthetic-project.supabase.co').classification,'HOSTED_PRODUCTION_SENSITIVE'))
check('Unknown remote URL is production sensitive',()=>assert.equal(classifySupabaseTarget('https://db.fixture.invalid').classification,'HOSTED_PRODUCTION_SENSITIVE'))
check('Loopback SDK endpoint is not proof of isolation',()=>assert.equal(classifySupabaseTarget('http://127.0.0.1:5059').writableAllowed,false))
check('Credential-bearing target rejected without disclosure',()=>assert.equal(classifySupabaseTarget('https://synthetic:synthetic@fixture.invalid').classification,'UNIDENTIFIED'))
check('Malformed target fails closed',()=>assert.equal(classifySupabaseTarget('invalid').classification,'UNIDENTIFIED'))
const valid={host:'127.0.0.1',port:55439,database:'votrix_hardening_123',actualDatabase:'votrix_hardening_123',actualPort:55439,actualDataDirectory:path.join(root,'.tmp/competition-postgres-tests'),syntheticDisposable:true}
check('Positive workspace clone identity accepted',()=>assert.equal(assertDisposablePostgres(valid,root),true))
for(const [name,patch]of [['Remote host',{host:'remote.invalid'}],['Unexpected port',{actualPort:5432}],['Wrong catalog identity',{actualDatabase:'production'}],['Outside workspace data directory',{actualDataDirectory:'C:/production'}],['Unknown database name',{database:'postgres',actualDatabase:'postgres'}],['Missing synthetic classification',{syntheticDisposable:false}]])check(name+' denied',()=>assert.throws(()=>assertDisposablePostgres({...valid,...patch},root),/blocked/))
check('Production-sensitive backend startup refused',()=>assert.throws(()=>assertBackendStartAllowed('https://synthetic-project.supabase.co'),/blocked/))
check('Unknown loopback startup also refused',()=>assert.throws(()=>assertBackendStartAllowed('http://127.0.0.1:5059'),/blocked/))
mkdirSync(out,{recursive:true});writeFileSync(path.join(out,'target-safety-tests.json'),JSON.stringify({passed:true,tests:checks.length,checks,databaseTarget:'NONE — pure tests only',networkOperations:false,backendStarted:false},null,2));console.log('PASS '+checks.length+' pure target safety checks; no database or network used')
