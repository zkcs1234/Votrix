import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
const dir='backend/scripts/',phase8='competition-phase8-2026-10-14',phase9='competition-phase9-2026-10-14'
mkdirSync('audits/'+phase9,{recursive:true})
for(const name of ['local-db','postgrest-fixture']){let s=readFileSync(dir+'phase8-'+name+'.mjs','utf8').replaceAll(phase8,phase9).replaceAll('PHASE8_USE_BROWSER_FIXTURE','PHASE9_USE_BROWSER_FIXTURE').replaceAll('./phase8-local-db.mjs','./phase9-local-db.mjs');writeFileSync(dir+'phase9-'+name+'.mjs',s,{flag:'wx'})}
for(const name of ['browser','browser-extended','database','capacity','transport','integrations']){let s=readFileSync(dir+'test-competition-phase8-'+name+'.mjs','utf8').replaceAll(phase8,phase9).replaceAll('./phase8-local-db.mjs','./phase9-local-db.mjs').replaceAll('./phase8-postgrest-fixture.mjs','./phase9-postgrest-fixture.mjs').replaceAll('.tmp/phase8-browser','.tmp/phase9-browser');writeFileSync(dir+'test-competition-phase9-'+name+'.mjs',s,{flag:'wx'})}
