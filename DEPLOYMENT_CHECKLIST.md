# Deployment Checklist - Event Voters Migration

## Pre-Deployment

### Code Review
- [x] All modified files reviewed
- [x] No syntax errors (diagnostics passing)
- [x] Consistent naming conventions used
- [x] Proper imports added

### Documentation
- [x] Bug fixes documented
- [x] Migration audit completed
- [x] Summary document created
- [x] Deployment checklist created

### Testing (Local/Dev)
- [ ] Test voter registration to election → dashboard shows assigned event
- [ ] Test voter registration to competition → dashboard shows assigned event
- [ ] Test voter registration to polling → dashboard shows assigned event
- [ ] Test information form → redirects to assigned event
- [ ] Test organizer dashboard → shows correct participant counts
- [ ] Test election results page → shows correct turnout
- [ ] Test judge invitation → sends without error
- [ ] Test CSV import → appears in recent activity

---

## Deployment Steps

### Step 1: Backend Deployment
```bash
# 1. Pull latest changes
git pull origin main

# 2. Review changes one more time
git diff HEAD~1 backend/src/services/

# 3. Restart backend service
npm run restart
# OR
pm2 restart votrix-backend
```

### Step 2: Frontend Deployment (if needed)
```bash
# 1. Build frontend
cd frontend
npm run build

# 2. Deploy build
# (your deployment process here)
```

### Step 3: Verify Services
- [ ] Backend health check passes
- [ ] Frontend loads without errors
- [ ] Database connections active

---

## Post-Deployment Testing

### Critical Path Tests (MUST PASS)

#### 1. Voter Dashboard
- [ ] Login as existing voter → dashboard shows correct assigned events count
- [ ] Dashboard shows correct event list (not empty)
- [ ] Click on event → navigates to correct page

#### 2. Voter Registration Flow
- [ ] Register new voter to election
- [ ] Check dashboard shows 1 assigned event
- [ ] Fill information form
- [ ] Verify redirects to election voting page (not dashboard)

#### 3. Organizer Dashboard
- [ ] Login as organizer
- [ ] Dashboard loads without errors
- [ ] Participant counts look reasonable (not 0, not inflated)
- [ ] Recent activity shows entries

#### 4. Judge Invitation
- [ ] Navigate to competition judges page
- [ ] Register new judge
- [ ] Click "Send Invitation"
- [ ] Verify success toast appears (not error)
- [ ] Verify judge list updates

#### 5. Election Results
- [ ] Navigate to election results page
- [ ] Verify turnout percentage is reasonable
- [ ] Verify voter counts match expected values

---

## Monitoring (First 24 Hours)

### Application Logs
Monitor for these errors:
- [ ] No "column does not exist" errors
- [ ] No "table or view not found" errors
- [ ] No "participant_type" related errors
- [ ] No ApiError 500s from modified services

### Database Monitoring
- [ ] Query response times normal (<100ms for counts)
- [ ] No queries to `event_voters` or `v_event_voters`
- [ ] `event_participants` table queries successful

### User Reports
Watch for:
- [ ] Dashboard showing 0 events (should be fixed)
- [ ] Judge invitation errors (should be fixed)
- [ ] Incorrect participant counts (should be fixed)
- [ ] Redirect loops after information form (should be fixed)

---

## Smoke Test Script

Run this quick test after deployment:

```bash
# 1. Health check
curl https://your-backend/health

# 2. Login as voter
# (use browser or API tool)

# 3. Check dashboard endpoint
curl -X GET https://your-backend/voter/dashboard \
  -H "Cookie: accessToken=YOUR_TOKEN"

# Expected: JSON with stats.assigned > 0 if voter is registered

# 4. Login as organizer
# (use browser or API tool)

# 5. Check organizer dashboard
curl -X GET https://your-backend/organizer/dashboard \
  -H "Cookie: accessToken=YOUR_TOKEN"

# Expected: JSON with statistics.totalAssigned > 0 if events exist
```

---

## Rollback Triggers

### Immediate Rollback If:
- [ ] Voter dashboards showing 0 for all users (regression)
- [ ] Judge invitation completely broken (not sending emails)
- [ ] Organizer dashboard showing 0 participants for all events
- [ ] Critical API endpoints returning 500 errors
- [ ] Database errors in logs related to participant queries

### Investigate First (Not Immediate Rollback):
- [ ] Slight discrepancies in counts (verify data first)
- [ ] Single user reporting issues (might be data-specific)
- [ ] Performance slightly slower (measure before reverting)

---

## Rollback Procedure

### Option 1: Git Revert (Full Rollback)
```bash
# 1. Identify commit hash
git log --oneline -5

# 2. Revert the migration commit
git revert <commit-hash>

# 3. Deploy reverted version
git push origin main

# 4. Restart services
npm run restart
```

### Option 2: Selective File Rollback
```bash
# Revert only specific files if only one module affected
git checkout HEAD~1 backend/src/services/election.service.js
git commit -m "Rollback election service"
git push origin main
```

### After Rollback:
1. Document what went wrong
2. Gather logs and error messages
3. Identify root cause
4. Create fix
5. Test thoroughly
6. Re-deploy

---

## Success Metrics

### Day 1 Success Criteria
- [ ] Zero rollbacks required
- [ ] No critical errors in logs
- [ ] User reports match expected (fixed issues)
- [ ] Database metrics stable

### Week 1 Success Criteria
- [ ] All testing checklist items passing
- [ ] Performance metrics stable or improved
- [ ] Zero related bug reports
- [ ] Monitoring shows expected query patterns

---

## Communication Plan

### If Issues Arise

#### Minor Issues (Investigate First)
- Document issue in GitHub issue tracker
- Gather logs and reproduction steps
- Assess impact (single user vs. system-wide)
- Fix if possible without rollback

#### Critical Issues (Rollback Needed)
- [ ] Notify team immediately
- [ ] Execute rollback procedure
- [ ] Post rollback announcement
- [ ] Schedule post-mortem
- [ ] Document lessons learned

---

## Post-Deployment Tasks

### Within 24 Hours
- [ ] Verify all critical path tests passing
- [ ] Check error logs (should be clean)
- [ ] Monitor performance metrics
- [ ] Respond to any user reports

### Within 1 Week
- [ ] Run full regression test suite
- [ ] Verify analytics data is accurate
- [ ] Check database query patterns
- [ ] Update status in documentation

### Within 1 Month
- [ ] Mark `v_event_voters` as deprecated (database comment)
- [ ] Update developer documentation
- [ ] Plan for view/table removal
- [ ] Archive migration documentation

---

## Files Changed Reference

Quick reference for rollback:
1. `backend/src/services/election.service.js` - 6 queries
2. `backend/src/services/polling.service.js` - 1 query
3. `backend/src/services/dashboard.service.js` - 7 queries + import
4. `backend/src/services/event.service.js` - 1 query
5. `frontend/src/pages/organizer/competition/CompetitionJudgesPage.jsx` - 1 fix

---

## Contact & Escalation

### For Questions
- Review: `MIGRATION_COMPLETE_SUMMARY.md`
- Technical details: `EVENT_VOTERS_MIGRATION_AUDIT.md`
- Bug context: `BUGFIX_JUDGE_INVITATION_AND_VOTER_DASHBOARD.md`

### For Issues
- Check logs first
- Review rollback procedure above
- Document issue before rollback
- Escalate if critical

---

**Deployment Date:** _____________
**Deployed By:** _____________
**Rollback Performed:** [ ] Yes [ ] No
**Issues Encountered:** _____________
**Final Status:** [ ] Success [ ] Partial [ ] Rollback

---

*Last Updated: August 12, 2026*
