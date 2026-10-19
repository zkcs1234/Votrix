import {readFileSync} from 'node:fs'
import path from 'node:path'
// This opt-in local mode never accepts an arbitrary URL or a hosted project.
// It runs before app initialization and all startup/background writing jobs.
export async function verifyLocalNativeRuntime(env){
 if(process.env.VOTRIX_LOCAL_NATIVE_MODE!=='true')return false
 if(env.nodeEnv!=='development')throw new Error('Isolated native mode requires development')
 const root=path.resolve(import.meta.dirname,'../../..'),dir=path.join(root,'.tmp/votrix-native-dev'),identity=JSON.parse(readFileSync(path.join(dir,'identity.json'))),api=JSON.parse(readFileSync(path.join(dir,'api-client.json')))
 if(env.supabase.url!=='http://127.0.0.1:5059'||env.supabase.serviceRoleKey!==api.serviceKey||identity.port!==55440||!/^votrix_dev_\d+$/.test(identity.database))throw new Error('Isolated database/API configuration mismatch; startup blocked')
 const response=await fetch(env.supabase.url+'/rest/v1/rpc/votrix_local_identity',{headers:{Authorization:'Bearer '+api.serviceKey},signal:AbortSignal.timeout(5000),redirect:'error'})
 if(!response.ok)throw new Error('Isolated database identity unavailable; startup blocked')
 const actual=await response.json()
 if(actual.database!==identity.database||Number(actual.port)!==55440||actual.nonce!==identity.nonce||path.resolve(actual.dataDirectory).toLowerCase()!==path.join(dir,'pgdata').toLowerCase())throw new Error('Isolated database identity mismatch; startup blocked')
 return actual
}
