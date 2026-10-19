import {Router} from 'express'
import {asyncHandler} from '../utils/asyncHandler.js'
import {publicApiLimiter} from '../middleware/rateLimiter.js'
import {publicResults} from '../services/competition-native-results.service.js'
import {nativePublicLimiter} from '../middleware/competition-rate-policy.js'
const router=Router()
router.get('/events/:eventId/competitions/:competitionId/results',nativePublicLimiter(publicApiLimiter),asyncHandler(async(req,res)=>{res.set('Cache-Control','no-store');res.json({success:true,...await publicResults(req.params.eventId,req.params.competitionId,req.query.roundId??null)})}))
export default router
