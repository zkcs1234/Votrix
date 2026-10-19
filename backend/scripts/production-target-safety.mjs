// Pure checks. No dotenv, application imports, SDK, sockets or database calls.
import path from 'node:path'
export function classifySupabaseTarget(value){
 if(!value)return {classification:'UNIDENTIFIED',writableAllowed:false}
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)return {classification:'UNIDENTIFIED',writableAllowed:false}
  const loopback=['127.0.0.1','localhost','[::1]'].includes(u.hostname)
  return {classification:loopback?'LOOPBACK_UNVERIFIED':'HOSTED_PRODUCTION_SENSITIVE',writableAllowed:false}
 }catch{return {classification:'UNIDENTIFIED',writableAllowed:false}}
}
export function assertDisposablePostgres(target,workspaceRoot){
 const expected=path.win32.resolve(workspaceRoot,'.tmp/competition-postgres-tests').toLowerCase()
 if(!target||target.host!=='127.0.0.1'||Number(target.port)!==55439||!/^votrix_(?:hardening|phase[789]_chain|phase[789]_populated_restore|native|tabulation|publication)_\d+(?:_restore)?$/.test(target.database??'')||target.actualDatabase!==target.database||Number(target.actualPort)!==55439||!target.actualDataDirectory||path.win32.resolve(target.actualDataDirectory).toLowerCase()!==expected||target.syntheticDisposable!==true)throw new Error('Database target is not a positively verified workspace disposable clone; operation blocked')
 return true
}
export function assertBackendStartAllowed(supabaseUrl){
 const classification=classifySupabaseTarget(supabaseUrl)
 // Loopback alone is insufficient: a proxy can forward to production.
 throw new Error(`Backend startup blocked (${classification.classification}); require independently verified isolated data, scheduler and side-effect configuration`)
}
