import {beforeAll,afterAll,describe,expect,test,vi} from 'vitest'
import request from 'supertest'
const f=vi.hoisted(()=>({users:new Map(),choices:vi.fn()}))
vi.mock('../../src/config/database.js',()=>({getSupabase:()=>null,checkDatabaseConnection:vi.fn()}))
vi.mock('../../src/config/cloudinary.js',()=>({configureCloudinary:()=>{}}))
vi.mock('../../src/services/user.service.js',async importOriginal=>({...await importOriginal(),findUserById:async id=>f.users.get(id)}))
vi.mock('../../src/services/participant.service.js',async importOriginal=>({...await importOriginal(),findEventParticipant:async()=>({participant_type:'COMPETITION_JUDGE',is_active:true})}))
vi.mock('../../src/services/competition-native-scoring.service.js',async importOriginal=>({...await importOriginal(),scoringChoicesResponse:f.choices}))
import {createApp} from '../../src/app.js'
import {signAccessToken} from '../../src/utils/jwt.js'
import {env} from '../../src/config/env.js'
const ids=[1,2,3].map(i=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`),event='20000000-0000-4000-8000-000000000001',path=`/api/participant/competition/events/${event}/competitions/scoring-contexts`
let app
beforeAll(()=>{vi.stubEnv('COMPETITION_NATIVE_RATE_POLICY_ENABLED','true');for(const id of ids)f.users.set(id,{id,account_status:'active',token_version:0});f.choices.mockResolvedValue({contexts:[],nativeEvent:true});app=createApp()})
afterAll(()=>vi.unstubAllEnvs())
const cookie=id=>`${env.jwt.accessCookieName}=${signAccessToken({sub:id,role:'participant',tokenVersion:0})}`
describe('Actual Express native rate middleware',()=>{
 test('shared-IP signed identities exceed the old 100/IP budget independently',async()=>{for(let n=0;n<220;n++){const response=await request(app).get(path).set('Cookie',cookie(ids[n%2]));expect(response.status).toBe(200)}expect(f.choices).toHaveBeenCalled()})
 test('forged identities/bearer headers cannot select an authenticated bucket',async()=>{expect((await request(app).get(path).set('Authorization',`Bearer ${signAccessToken({sub:ids[0],role:'participant'})}`).set('x-user-id',ids[0])).status).toBe(401)})
 test('bounded identity budget returns Retry-After and does not run the handler',async()=>{let response;for(let n=0;n<601;n++)response=await request(app).get(path).set('Cookie',cookie(ids[2]));expect(response.status).toBe(429);expect(Number(response.headers['retry-after'])).toBeGreaterThan(0)})
 test('valid signatures do not bypass current account/token revocation checks',async()=>{f.users.get(ids[0]).token_version=1;expect((await request(app).get(path).set('Cookie',cookie(ids[0]))).status).toBe(401)})
 test('public competition polling has recovery headroom without widening unrelated public routes',async()=>{for(let n=0;n<125;n++){const response=await request(app).get(`/api/public/competition/events/${event}/competitions/${event}/results`);expect(response.status).not.toBe(429)}let response;for(let n=0;n<101;n++)response=await request(app).get('/api/unknown');expect(response.status).toBe(429)})
})
