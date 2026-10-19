import rateLimit,{ipKeyGenerator} from 'express-rate-limit'
import {verifyAccessToken} from '../utils/jwt.js'
import {env} from '../config/env.js'
import {ApiError} from '../utils/ApiError.js'
import {judgeScoreLimiter} from './rateLimiter.js'

export const NATIVE_RATE_BUDGETS=Object.freeze({networkPerMinute:12000,userPerMinute:600,writesPerMinute:300,invalidCookiePerMinute:60,publicPerMinute:300,publicPer15Minutes:4000})
const ip=req=>ipKeyGenerator(req.ip||req.socket.remoteAddress||'unknown')
const limiter=(max,windowMs,keyGenerator)=>rateLimit({max,windowMs,keyGenerator,standardHeaders:true,legacyHeaders:false,message:{success:false,message:'Competition request limit reached. Retry after the indicated delay.'}})
const network=limiter(NATIVE_RATE_BUDGETS.networkPerMinute,60000,ip),invalid=limiter(NATIVE_RATE_BUDGETS.invalidCookiePerMinute,60000,ip)
const user=limiter(NATIVE_RATE_BUDGETS.userPerMinute,60000,req=>req.competitionRateSubject),writes=limiter(NATIVE_RATE_BUDGETS.writesPerMinute,60000,req=>req.competitionRateSubject)
const publicBurst=limiter(NATIVE_RATE_BUDGETS.publicPerMinute,60000,ip),publicWindow=limiter(NATIVE_RATE_BUDGETS.publicPer15Minutes,900000,ip)
export const competitionRatePolicyEnabled=()=>process.env.COMPETITION_NATIVE_RATE_POLICY_ENABLED==='true'
export function competitionRatePolicy(req,res,next){
 if(!competitionRatePolicyEnabled())return next()
 const path=req.path,publicRead=req.method==='GET'&&path.startsWith('/api/public/competition/')
 const privatePath=/^\/api\/(organizer|participant|voter)\/(competition|pageant)(\/|$)/.test(path)
 if(!publicRead&&!privatePath)return next()
 const accepted=()=>{req.competitionRatePolicyApplied=true;next()}
 if(publicRead)return publicBurst(req,res,()=>publicWindow(req,res,accepted))
 network(req,res,()=>{
  let decoded
  try{decoded=verifyAccessToken(req.cookies?.[env.jwt.accessCookieName]);if(!/^[0-9a-f-]{36}$/i.test(decoded.sub??''))throw new Error('Invalid subject')}
  catch{return invalid(req,res,()=>next(new ApiError(401,'Authentication required')))}
  // Signature-verified quota identity is not authorization. Normal auth below
  // still checks account/session/token revocation and each resource permission.
  req.competitionRateSubject=decoded.sub
  user(req,res,()=>['POST','PUT','PATCH','DELETE'].includes(req.method)?writes(req,res,accepted):accepted())
 })
}
export function nativeJudgeScoreLimiter(req,res,next){return req.competitionRatePolicyApplied===true?next():judgeScoreLimiter(req,res,next)}
export function nativePublicLimiter(legacy){return (req,res,next)=>req.competitionRatePolicyApplied===true?next():legacy(req,res,next)}
