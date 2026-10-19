import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
const manifest=vi.hoisted(()=>({database:'votrix_dev_123',port:55440,nonce:'synthetic-proof'}))
vi.mock('node:fs',()=>({readFileSync:path=>JSON.stringify(String(path).endsWith('api-client.json')?{serviceKey:'local-key'}:manifest)}))
import {verifyLocalNativeRuntime} from '../../src/config/local-native-safety.js'
import {fileURLToPath} from 'node:url'
const config={nodeEnv:'development',supabase:{url:'http://127.0.0.1:5059',serviceRoleKey:'local-key'}}
beforeEach(()=>{vi.stubEnv('VOTRIX_LOCAL_NATIVE_MODE','true');vi.stubGlobal('fetch',vi.fn())})
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
describe('isolated startup before any writing jobs',()=>{
 it('does not change ordinary startup when local mode is absent',async()=>{vi.stubEnv('VOTRIX_LOCAL_NATIVE_MODE','false');expect(await verifyLocalNativeRuntime(config)).toBe(false);expect(fetch).not.toHaveBeenCalled()})
 it('rejects a hosted SDK target before requesting it',async()=>{await expect(verifyLocalNativeRuntime({...config,supabase:{...config.supabase,url:'https://production.example'}})).rejects.toThrow('configuration mismatch');expect(fetch).not.toHaveBeenCalled()})
 it('rejects production execution even with local credentials',async()=>{await expect(verifyLocalNativeRuntime({...config,nodeEnv:'production'})).rejects.toThrow('requires development')})
 it('fails closed when the identity endpoint is unavailable',async()=>{fetch.mockResolvedValue({ok:false});await expect(verifyLocalNativeRuntime(config)).rejects.toThrow('identity unavailable')})
 it('rejects another database despite successful HTTP status',async()=>{fetch.mockResolvedValue({ok:true,json:async()=>({...manifest,database:'shared',dataDirectory:'C:/wrong'})});await expect(verifyLocalNativeRuntime(config)).rejects.toThrow('identity mismatch')})
 it('returns only verified local identity for loopback runtime proof',async()=>{const actual={...manifest,dataDirectory:fileURLToPath(new URL('../../../.tmp/votrix-native-dev/pgdata',import.meta.url))};fetch.mockResolvedValue({ok:true,json:async()=>actual});expect(await verifyLocalNativeRuntime(config)).toBe(actual)})
})
