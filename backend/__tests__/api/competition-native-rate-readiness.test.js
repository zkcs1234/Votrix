// Measures current middleware budgets; does not change election/polling limits.
import {describe,it,expect} from 'vitest'
import express from 'express'
import request from 'supertest'
import {globalLimiter,publicApiLimiter} from '../../src/middleware/rateLimiter.js'
describe('Native workflow deployment rate budgets',()=>{
 it('documents that authentication after the global limiter leaves shared judges on the anonymous IP budget',async()=>{
  const app=express();app.use(globalLimiter);app.use((req,_res,next)=>{req.user={id:req.headers['x-fixture-actor']};next()});app.get('/api/participant/competition/events/fixture/competitions/child/live',(_req,res)=>res.json({success:true}))
  let last;for(let n=0;n<101;n++)last=await request(app).get('/api/participant/competition/events/fixture/competitions/child/live').set('x-fixture-actor',n%2?'judge-one':'judge-two')
  expect(last.status).toBe(429);expect(last.headers['ratelimit-limit']).toBe('100')
 })
 it('documents that one public polling budget is shared by all viewers behind an IP',async()=>{
  const app=express();app.use(publicApiLimiter);app.get('/api/public/competition/events/fixture/competitions/child/results',(_req,res)=>res.json({publicationVersion:1}))
  let last;for(let n=0;n<61;n++)last=await request(app).get('/api/public/competition/events/fixture/competitions/child/results')
  expect(last.status).toBe(429);expect(last.headers['ratelimit-limit']).toBe('60')
 })
})
