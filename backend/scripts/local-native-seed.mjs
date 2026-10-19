// Synthetic accounts only, guarded by real catalog identity in the fresh cluster.
import {spawnSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {randomUUID,randomBytes} from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
import bcrypt from '../node_modules/bcrypt/bcrypt.js'
const root=path.resolve(import.meta.dirname,'../..'),dir=path.join(root,'.tmp/votrix-native-dev'),identity=JSON.parse(readFileSync(path.join(dir,'identity.json'))),env={...process.env,PGOPTIONS:'',PGCONNECT_TIMEOUT:'5'};delete env.PGSERVICE;delete env.PGSERVICEFILE
const sql=source=>{const r=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-w','-q','-At','-h','127.0.0.1','-p','55440','-U','postgres','-d',identity.database,'-v','ON_ERROR_STOP=1'],{input:source,env,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
assert.match(identity.database,/^votrix_dev_\d+$/);assert.equal(identity.port,55440);const actual=JSON.parse(sql('SELECT votrix_local_identity()'));assert.equal(actual.nonce,identity.nonce);assert.equal(path.resolve(actual.dataDirectory).toLowerCase(),path.resolve(identity.dataDirectory).toLowerCase())
const accounts=[];for(const [name,role]of [['Organizer','organizer'],['Judge One','participant'],['Judge Two','participant'],['Reviewer','participant'],['Outsider','participant']]){
 const id=randomUUID(),email=name.toLowerCase().replaceAll(' ','-')+'@votrix.test',password='LocalNative!'+randomBytes(8).toString('hex'),hash=await bcrypt.hash(password,10)
 sql(`INSERT INTO users(id,email,password,role,account_status,must_change_password,first_name,last_name,organization_name,organizer_name,organization_type_display,position)VALUES('${id}','${email}','${hash}','${role}','active',false,'Local','${name}','Synthetic campus','Local Organizer','School','QA')`)
 if(role==='participant')sql(`INSERT INTO user_participant_types(user_id,participant_type,is_active)VALUES('${id}','COMPETITION_JUDGE',true)`)
 accounts.push({id,name,role,email,password})
}
writeFileSync(path.join(dir,'accounts.json'),JSON.stringify(accounts,null,2),{flag:'wx'});console.log('Created five synthetic accounts; credentials saved only in the ignored local directory')
