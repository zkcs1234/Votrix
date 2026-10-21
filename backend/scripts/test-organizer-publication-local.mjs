// Synthetic localhost fixture only. Migrations and test data always roll back.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'

const root=path.resolve(import.meta.dirname,'../..')
const local=path.join(root,'.tmp/votrix-native-dev')
const identity=JSON.parse(readFileSync(path.join(local,'identity.json'),'utf8'))
assert.match(identity.database,/^votrix_dev_\d+$/)
assert.equal(identity.port,55440)
const environment={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'5'}
delete environment.PGSERVICE
delete environment.PGSERVICEFILE
const sql=source=>{
 const result=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55440','-U','postgres','-d',identity.database,'-v','ON_ERROR_STOP=1'],{input:source,env:environment,encoding:'utf8',windowsHide:true,timeout:60000})
 assert.equal(result.status,0,result.stderr||result.error?.message)
 return {output:result.stdout.trim(),notices:result.stderr.trim()}
}
const proof=JSON.parse(sql('SELECT votrix_local_identity()').output)
assert.equal(proof.nonce,identity.nonce)
assert.equal(Number(proof.port),55440)
assert.equal(path.resolve(proof.dataDirectory).toLowerCase(),path.join(local,'pgdata').toLowerCase())
const read=name=>readFileSync(path.join(root,name),'utf8')
const migration=name=>read(`backend/src/database/migrations/${name}`).replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'')
const completion=sql("SELECT to_regprocedure('competition_child_publication_action_v129(uuid,uuid,uuid,uuid,text,jsonb)') IS NOT NULL").output==='t'
 ?'':migration('129_native_competition_completion.sql')
const update=migration('134_competition_organizer_publication.sql')
const before=sql('SELECT count(*) FROM competition_child_publications').output
const result=sql(`BEGIN;
 ${migration('127_competition_idempotent_auto_calculation.sql')}
 ${completion}
 ${read('backend/__tests__/fixtures/native-round-advancement-setup.sql')}
 ${migration('130_pageant_division_tabulation.sql')}
 ${migration('131_native_round_advancement_status.sql')}
 ${migration('133_competition_organizer_finalization.sql')}
 ${update} ${update}
 ${read('backend/__tests__/fixtures/organizer-publication-assertions.sql')}
 ROLLBACK;`)
assert.equal(sql('SELECT count(*) FROM competition_child_publications').output,before)
console.log(result.notices)
console.log('PASS organizer publication, completion, withdrawal, guards and migration rerun; all changes rolled back')
