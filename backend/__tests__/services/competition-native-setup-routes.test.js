import {beforeEach,describe,expect,it,vi} from 'vitest'
import express from 'express'
import request from 'supertest'
const state=vi.hoisted(()=>({enabled:vi.fn(),list:vi.fn(),pool:vi.fn(),pick:vi.fn(),role:vi.fn()}))
vi.mock('../../src/modules/competition-native-configuration.js',()=>({nativeSetupEnabled:state.enabled}))
vi.mock('../../src/controllers/competition.controller.js',()=>({listJudgesV2:state.list,getJudgePool:state.pool,pickJudges:state.pick,updateJudgeV2:state.role}))
vi.mock('../../src/services/competition-child.service.js',()=>({}))
vi.mock('../../src/services/competition-native.service.js',()=>({}))
vi.mock('../../src/services/competition-native-scoring.service.js',()=>({}))
vi.mock('../../src/services/competition-native-tabulation.service.js',()=>({}))
vi.mock('../../src/services/competition-native-results.service.js',()=>({}))
import router from '../../src/routes/competition-child.routes.js'
const event='12345678-1234-4234-8234-123456789012',participant='22345678-1234-4234-8234-123456789012'
const app=express();app.use(express.json());app.use(`/events/:eventId/competitions`,(req,_res,next)=>{req.user={id:'authenticated-owner'};next()},router);app.use((e,_req,res,_next)=>res.status(e.statusCode??500).json({message:e.message}))
beforeEach(()=>{vi.clearAllMocks();state.enabled.mockReturnValue(true);for(const fn of [state.list,state.pool,state.pick,state.role])fn.mockImplementation((req,res)=>res.json({eventId:req.params.eventId,actor:req.user.id,body:req.body,participant:req.params.judgeId}))})
describe('Explicit native event enrollment routes',()=>{
 it('rejects reads and enrollment mutations when native setup prerequisite is disabled',async()=>{state.enabled.mockReturnValue(false);expect((await request(app).get(`/events/${event}/competitions/enrollments`)).status).toBe(503);expect((await request(app).post(`/events/${event}/competitions/enrollments/pick`).send({userIds:[participant]})).status).toBe(503);expect(state.list).not.toHaveBeenCalled();expect(state.pick).not.toHaveBeenCalled()})
 it('binds enrollment reads and role updates to the authenticated event route and prevents caching private responses',async()=>{const read=await request(app).get(`/events/${event}/competitions/enrollments`);expect(read.headers['cache-control']).toBe('no-store');expect(read.body).toMatchObject({eventId:event,actor:'authenticated-owner'});const update=await request(app).patch(`/events/${event}/competitions/enrollments/${participant}`).send({role:'score_reviewer'});expect(update.body).toMatchObject({eventId:event,participant,body:{role:'score_reviewer'}})})
 it('never sends invitations through native enrollment and rejects requested notifications',async()=>{expect((await request(app).post(`/events/${event}/competitions/enrollments/pick`).send({userIds:[participant],notify:true})).status).toBe(400);expect(state.pick).not.toHaveBeenCalled();expect((await request(app).post(`/events/${event}/competitions/enrollments/pick`).send({userIds:[participant],notify:false})).status).toBe(200)})
})
