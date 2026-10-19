// Explicitly local, additive compatibility fixes. No dotenv or application import.
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),identity=JSON.parse(readFileSync(path.join(dir,'identity.json')))
const sql=source=>{const r=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55440','-U','postgres','-d',identity.database,'-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',windowsHide:true,env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,PGCONNECT_TIMEOUT:'5'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
assert.match(identity.database,/^votrix_dev_\d+$/);const proof=JSON.parse(sql('SELECT votrix_local_identity()'));assert.equal(proof.nonce,identity.nonce);assert.equal(Number(proof.port),55440);assert.equal(path.resolve(proof.dataDirectory).toLowerCase(),path.join(dir,'pgdata').toLowerCase())
const file='109_competition_full_foundation_compatibility.sql',source=readFileSync(path.join(root,'backend/src/database/migrations',file),'utf8'),sha256=createHash('sha256').update(source).digest('hex')
sql(source);sql(`INSERT INTO local_development_migration_ledger(filename,sha256)VALUES('${file}','${sha256}')ON CONFLICT(filename)DO UPDATE SET sha256=excluded.sha256`)
// The repository foundation lacks this lifecycle label used by existing list
// filters. Add the enum member only in this isolated cluster; change no records.
sql("ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'archived'")
sql("NOTIFY pgrst,'reload schema'")
writeFileSync(path.join(root,'audits/native-local-activation-2026-10-14/local-compatibility.json'),JSON.stringify({database:identity.database,verified:true,migration:file,sha256,localOnlyEnumAddition:'event_status.archived',rowUpdates:false,productionTouched:false},null,2));console.log('Applied guarded isolated compatibility fixes; no records updated')
