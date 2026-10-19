import{readFileSync,writeFileSync}from'node:fs'
const integration=JSON.parse(readFileSync('audits/competition-phase8-2026-10-14/postgres-integration.json'))
let source=readFileSync('backend/scripts/test-competition-phase7-populated-restore.mjs','utf8')
source=source.replaceAll('competition-phase7-2026-10-13','competition-phase8-2026-10-14').replace("source='votrix_publication_1791898451572'",`source='${integration.database}'`).replace("audits/competition-phase6-2026-10-13/native-preflight-complete.json","audits/competition-phase8-2026-10-14/native-preflight-final.json").replace('votrix_phase7_populated_restore_','votrix_phase8_populated_restore_')
writeFileSync('backend/scripts/test-competition-phase8-restore.mjs',source)
