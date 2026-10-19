import {expect,test} from 'vitest'
import {clearCompetitionScoreDrafts,clearVotrixDrafts} from './draftStorage'
test('account switch removes scoring recovery and retry data while preserving other module drafts',()=>{
 localStorage.clear();localStorage.setItem('votrix.scoring.v1:judge:event:session:round:rules','private score');localStorage.setItem('competition_retry_queue_v2_judge_event_session_round_rules','queued score');localStorage.setItem('votrix_election_draft_event','ballot draft');localStorage.setItem('preference','dark')
 clearCompetitionScoreDrafts();expect(localStorage.getItem('votrix.scoring.v1:judge:event:session:round:rules')).toBeNull();expect(localStorage.getItem('competition_retry_queue_v2_judge_event_session_round_rules')).toBeNull();expect(localStorage.getItem('votrix_election_draft_event')).toBe('ballot draft')
 clearVotrixDrafts();expect(localStorage.getItem('votrix_election_draft_event')).toBeNull();expect(localStorage.getItem('preference')).toBe('dark')
})
