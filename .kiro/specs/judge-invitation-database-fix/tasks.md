# Tasks

## Task 1: Verify Database Query Fix
**Type:** verification  
**Dependencies:** none  
**Optional:** false

### Description
Verify that the database query fix in `sendJudgeInvitation` function correctly uses the `id` field instead of the `user_id` field when looking up judges in the `competition_judges` table.

### Acceptance Criteria
- [x] The query in `pageant.service.js` line 735 uses `.eq('id', judgeId)` instead of `.eq('user_id', judgeId)`
- [-] The query successfully retrieves judge records when given a valid `competition_judges.id` value
- [~] The query returns null/undefined when given a non-existent `competition_judges.id` value
- [~] The foreign key relationship to users table remains intact in the SELECT statement

### Sub-tasks
1. **Code Review**: Review the corrected database query in `backend/src/services/pageant.service.js`
2. **Database Schema Verification**: Confirm `competition_judges` table structure matches expected design
3. **Query Testing**: Test the corrected query with valid and invalid judge IDs
4. **Foreign Key Verification**: Ensure the users table join works correctly with the fix

## Task 2: Create Property-Based Tests for Judge Invitation
**Type:** implementation  
**Dependencies:** Task 1  
**Optional:** false

### Description
Implement property-based tests that verify the correctness properties defined in the design document, focusing on database lookup correctness and error handling.

### Acceptance Criteria
- [~] Property test for "Primary Key Database Lookup Correctness" with 100+ iterations
- [~] Property test for "Error Message Accuracy for Enrolled Judges" 
- [~] Property test for "Legitimate Error Handling" with invalid judge IDs
- [~] Property test for "Unique Judge Identification in Multi-Judge Events"
- [~] All property tests use proper test tags referencing the design document

### Sub-tasks
1. **Test Setup**: Create test file `__tests__/services/judge-invitation-database-fix.test.js`
2. **Property 1 Test**: Implement primary key lookup correctness property test
3. **Property 3 Test**: Implement error message accuracy property test  
4. **Property 4 Test**: Implement legitimate error handling property test
5. **Property 7 Test**: Implement unique identification property test
6. **Test Data**: Generate valid test data for competition judges and events

## Task 3: Manual Integration Testing
**Type:** testing  
**Dependencies:** Task 1  
**Optional:** false

### Description
Perform manual end-to-end testing of the judge invitation flow using the running development servers to verify the fix works correctly in the user interface.

### Acceptance Criteria
- [~] Can register new judges through the Competition Judges page
- [~] Can successfully send invitations to registered judges without "not enrolled" errors
- [~] Invitation emails are sent successfully for both new and existing accounts
- [~] Frontend updates invitation status correctly after sending
- [~] Error messages are appropriate when testing with invalid scenarios

### Sub-tasks
1. **Test Environment Setup**: Ensure backend and frontend servers are running
2. **Judge Registration**: Test registering judges through the UI
3. **Individual Invitations**: Test sending invitations to individual judges
4. **Bulk Invitations**: Test "Send All Invitations" functionality
5. **Error Scenarios**: Test invitation attempts with deleted/invalid judges
6. **Email Verification**: Confirm emails are actually sent and contain correct content

## Task 4: Performance and Concurrency Testing
**Type:** testing  
**Dependencies:** Task 2, Task 3  
**Optional:** false

### Description
Test the performance characteristics and concurrent access patterns of the corrected database query to ensure it scales appropriately under realistic load.

### Acceptance Criteria
- [~] Database query performance is within acceptable limits (< 100ms for single lookup)
- [~] Concurrent invitation operations handle correctly without race conditions
- [~] Database connection pooling works correctly with the corrected query
- [~] Query plan analysis shows efficient index usage on `competition_judges.id`
- [~] Memory usage remains stable during bulk invitation operations

### Sub-tasks
1. **Performance Baseline**: Measure query performance before and after the fix
2. **Concurrency Testing**: Test simultaneous invitation operations by multiple organizers  
3. **Query Plan Analysis**: Analyze PostgreSQL query execution plan for efficiency
4. **Load Testing**: Test invitation system with realistic judge/event volumes
5. **Resource Monitoring**: Monitor database connection and memory usage during testing

## Task 5: Documentation and Deployment Preparation
**Type:** documentation  
**Dependencies:** Task 3, Task 4  
**Optional:** false

### Description
Update documentation to reflect the fix and prepare deployment notes for production rollout of the corrected judge invitation functionality.

### Acceptance Criteria
- [~] Update API documentation to clarify judge ID parameter requirements
- [~] Create deployment notes documenting the fix and testing performed
- [~] Update troubleshooting guides to remove incorrect "not enrolled" error scenarios
- [~] Document the corrected database schema relationships
- [~] Prepare rollback procedure in case of deployment issues

### Sub-tasks
1. **API Documentation**: Update judge invitation endpoint documentation
2. **Database Documentation**: Document corrected field usage in database docs
3. **Deployment Guide**: Create step-by-step deployment instructions
4. **Troubleshooting Update**: Update error resolution guides
5. **Rollback Plan**: Document rollback procedure and verification steps

## Task 6: Regression Test Suite Integration
**Type:** implementation  
**Dependencies:** Task 2  
**Optional:** false

### Description
Integrate the new property-based tests into the continuous integration pipeline and ensure they run automatically to prevent similar issues in the future.

### Acceptance Criteria
- [~] Property-based tests are included in the main test suite
- [~] CI pipeline runs the new tests automatically on relevant code changes
- [~] Test failures block deployments that could introduce similar database lookup bugs
- [~] Test coverage reports include the new judge invitation test scenarios
- [~] Tests run efficiently within the CI time constraints

### Sub-tasks
1. **CI Integration**: Add new tests to the CI/CD pipeline configuration
2. **Test Performance**: Optimize test execution time for CI environments
3. **Coverage Analysis**: Ensure test coverage includes all critical invitation code paths
4. **Failure Handling**: Configure appropriate test failure notifications
5. **Documentation**: Document the new tests for future developers