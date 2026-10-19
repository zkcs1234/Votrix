// Builds a fresh synthetic-only database in its OWN loopback PostgreSQL cluster.
// No dotenv, Supabase client or app import. Never touches prior test templates.
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs'
import {createHash,randomUUID,randomBytes} from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),out=path.join(root,'audits/native-local-activation-2026-10-14'),bin='C:/Program Files/PostgreSQL/18/bin';mkdirSync(dir,{recursive:true});mkdirSync(out,{recursive:true})
const manifestFile=path.join(dir,'identity.json'),identity=existsSync(manifestFile)?JSON.parse(readFileSync(manifestFile)):{database:'votrix_dev_'+Date.now(),port:55440,dataDirectory:path.join(dir,'pgdata'),nonce:randomUUID(),authenticatorPassword:randomBytes(32).toString('hex'),postgrestSecret:randomBytes(40).toString('hex')}
assert.match(identity.database,/^votrix_dev_\d+$/);assert.equal(identity.port,55440);assert.equal(path.resolve(identity.dataDirectory),path.join(dir,'pgdata'));if(!existsSync(manifestFile))writeFileSync(manifestFile,JSON.stringify(identity,null,2),{flag:'wx'})
const env={...process.env,PGCONNECT_TIMEOUT:'5',PGOPTIONS:''};delete env.PGSERVICE;delete env.PGSERVICEFILE;delete env.DATABASE_URL;delete env.PGHOST;delete env.PGPORT;delete env.PGDATABASE
export function sql(source,database=identity.database){assert.ok([identity.database,'postgres'].includes(database));const r=spawnSync(path.join(bin,'psql.exe'),['-X','-w','-q','-At','-h','127.0.0.1','-p',String(identity.port),'-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],{input:source,env,encoding:'utf8',windowsHide:true,maxBuffer:64*1024*1024,timeout:90000});if(r.status!==0)throw new Error((r.stderr||r.error?.message).replaceAll(identity.authenticatorPassword,'[redacted]'));return r.stdout.trim()}
const actualDir=sql('SHOW data_directory','postgres');assert.equal(path.resolve(actualDir).toLowerCase(),path.resolve(identity.dataDirectory).toLowerCase());assert.equal(Number(sql('SHOW port','postgres')),55440)
if(process.argv.includes('--inspect')){console.log(JSON.stringify({database:identity.database,port:identity.port,dataDirectoryVerified:true,dbExists:sql(`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='${identity.database}')`,'postgres')}));process.exit(0)}
const names=readdirSync(path.join(root,'backend/src/database/migrations')).filter(f=>/^\d+_.*\.sql$/.test(f)&&!/(?:^|_)down(?:_|\.)/i.test(f)).sort()
// 038's existing companion supplies event_id needed by the division indexes.
const fix038=names.indexOf('038_fix_competition_tables_event_id.sql');names.splice(fix038,1);names.splice(names.indexOf('038_competition_divisions.sql'),0,'038_fix_competition_tables_event_id.sql')
const migrationManifest=names.map(file=>({file,sha256:createHash('sha256').update(readFileSync(path.join(root,'backend/src/database/migrations',file))).digest('hex')}));writeFileSync(path.join(out,'forward-manifest.json'),JSON.stringify({scope:'Fresh empty isolated database only; forward numeric/filename order with 038 event-ID dependency before division indexes; down scripts excluded',migrations:migrationManifest},null,2))
if(sql(`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='${identity.database}')`,'postgres')!=='t'){
 sql(`CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE votrix_authenticator LOGIN NOINHERIT PASSWORD '${identity.authenticatorPassword}';GRANT anon,authenticated,service_role TO votrix_authenticator;CREATE DATABASE ${identity.database};`,'postgres')
 sql('CREATE TABLE public.local_development_migration_ledger(filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;')
}
const applied=[],overlays=existsSync(path.join(out,'foundation-failure.json'))?(JSON.parse(readFileSync(path.join(out,'foundation-failure.json'))).overlays??[]):[]
for(const migration of migrationManifest){const prior=sql(`SELECT sha256 FROM public.local_development_migration_ledger WHERE filename='${migration.file}'`);if(prior){assert.equal(prior,migration.sha256);continue}
 if(sql("SELECT to_regclass('public.users') IS NOT NULL")==='t')assert.equal(Number(sql('SELECT count(*) FROM public.users')),0,'Foundation replay is restricted to an empty synthetic development database')
 let source=readFileSync(path.join(root,'backend/src/database/migrations',migration.file),'utf8');
 if(migration.file==='011_rename_pageant_to_competition_scoring.sql'){
  // Original historical SQL uses unsupported ALTER TRIGGER IF EXISTS and
  // consumes a newly added enum in the same transaction. Preserve the file;
  // apply an explicitly recorded syntax/commit overlay in this empty dev DB.
  sql("ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'competition_scoring';ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'competition_scoring';")
  source=source.replace(/ALTER TRIGGER IF EXISTS (\w+) ON (\w+)\s+RENAME TO (\w+);/g,(_match,old,table,next)=>`DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.${table}'::regclass AND tgname='${old}') THEN ALTER TRIGGER ${old} ON public.${table} RENAME TO ${next}; END IF; END $$;`)
  overlays.push({file:migration.file,originalSha256:migration.sha256,executedSha256:createHash('sha256').update(source).digest('hex'),reason:'Guarded trigger rename syntax and precommitted enum additions; fresh isolated database only'})
 }
 if(migration.file==='030_event_information_form_schema.sql'){
  source=source.replace(/^\s*<\/[^\r\n]*tool_calls>\s*$/m,'')
  overlays.push({file:migration.file,originalSha256:migration.sha256,executedSha256:createHash('sha256').update(source).digest('hex'),reason:'Remove trailing non-SQL tool markup after COMMIT; SQL definitions unchanged'})
 }
 if(migration.file==='039_per_division_contestant_number.sql'){
  source=source.replace('DROP INDEX IF EXISTS public.competition_contestants_number_unique;','ALTER TABLE competition_contestants DROP CONSTRAINT IF EXISTS competition_contestants_number_unique;\nDROP INDEX IF EXISTS public.competition_contestants_number_unique;')
  overlays.push({file:migration.file,originalSha256:migration.sha256,executedSha256:createHash('sha256').update(source).digest('hex'),reason:'Drop the renamed constraint before its owned index; retains the source migration intended replacement uniqueness'})
 }
 try{sql(source);sql(`INSERT INTO public.local_development_migration_ledger(filename,sha256)VALUES('${migration.file}','${migration.sha256}')`);applied.push(migration.file);console.log('Applied '+migration.file)}catch(error){writeFileSync(path.join(out,'foundation-failure.json'),JSON.stringify({database:identity.database,failedMigration:migration.file,message:error.message,applied,overlays,productionTouched:false},null,2));throw error}
}
sql(`CREATE OR REPLACE FUNCTION public.votrix_local_identity() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$SELECT jsonb_build_object('database',current_database(),'port',current_setting('port'),'dataDirectory',current_setting('data_directory'),'nonce','${identity.nonce}')$$;REVOKE ALL ON FUNCTION public.votrix_local_identity() FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.votrix_local_identity() TO service_role;`)
const tables=JSON.parse(sql("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public'"));writeFileSync(path.join(out,'foundation.json'),JSON.stringify({passed:true,database:identity.database,port:55440,clusterDirectoryVerified:true,syntheticOnly:true,tables,migrationCount:migrationManifest.length,overlays,nativeVersions:[103,104,105,106,107,108],productionTouched:false},null,2));console.log('Complete isolated foundation: '+tables.length+' tables')
