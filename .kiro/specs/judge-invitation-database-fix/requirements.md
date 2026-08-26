# Requirements Document

## Introduction

This specification addresses a critical bug in the Votrix competition module where judge invitations were failing with "Judge is not enrolled in this event" error, even for properly registered judges. The root cause was identified as an incorrect database field lookup in the `sendJudgeInvitation` function, which was querying the `competition_judges` table using the wrong field identifier.

The fix ensures reliable judge invitation functionality by correcting the database lookup to use the proper primary key field instead of the foreign key field.

## Glossary

- **Competition_Judges_Table**: Database table storing judge enrollment data with primary key `id` and foreign key `user_id`
- **Judge_Invitation_System**: Service responsible for sending invitation emails to enrolled judges
- **Database_Lookup_Query**: SQL query that locates judge records in the competition_judges table
- **Frontend_Judge_ID**: The identifier passed from the frontend interface when requesting judge invitations
- **Primary_Key_Field**: The `id` field in `competition_judges` table (UUID primary key)
- **Foreign_Key_Field**: The `user_id` field in `competition_judges` table (references users.id)

## Requirements

### Requirement 1: Correct Database Field Identification

**User Story:** As a competition organizer, I want judge invitations to work reliably, so that I can successfully invite enrolled judges without encountering false error messages.

#### Acceptance Criteria

1. WHEN the system queries the `competition_judges` table for invitation purposes, THE Database_Lookup_Query SHALL use the Primary_Key_Field (`id`) to match against the Frontend_Judge_ID
2. WHEN a judge invitation is requested with a valid Frontend_Judge_ID, THE Judge_Invitation_System SHALL successfully locate the judge record in the Competition_Judges_Table
3. THE Judge_Invitation_System SHALL NOT query using the Foreign_Key_Field (`user_id`) when the Frontend_Judge_ID represents a Primary_Key_Field value
4. WHEN the correct Primary_Key_Field is used in the query, THE system SHALL return the associated judge data including user information
5. THE Database_Lookup_Query SHALL maintain referential integrity by properly joining Competition_Judges_Table with users table

### Requirement 2: Error Prevention and Validation

**User Story:** As a competition organizer, I want clear error messages when judge invitations fail, so that I can distinguish between actual enrollment issues and system bugs.

#### Acceptance Criteria

1. WHEN a judge is properly enrolled but invitation fails due to incorrect field lookup, THE system SHALL NOT return "Judge is not enrolled in this event" error
2. WHEN a judge ID does not exist in the Primary_Key_Field of Competition_Judges_Table, THEN THE system SHALL return "Judge is not enrolled in this event" error
3. THE system SHALL validate that the Frontend_Judge_ID corresponds to an existing Primary_Key_Field value before attempting invitation
4. WHEN database queries fail due to connectivity or constraint issues, THE system SHALL return appropriate technical error messages
5. THE Judge_Invitation_System SHALL distinguish between enrollment validation errors and database lookup errors

### Requirement 3: Data Consistency and Integrity

**User Story:** As a system administrator, I want reliable data relationships between judges and events, so that the invitation system maintains data consistency.

#### Acceptance Criteria

1. THE Database_Lookup_Query SHALL ensure Foreign_Key_Field references remain intact during invitation operations
2. WHEN retrieving judge information for invitations, THE system SHALL maintain consistency between Competition_Judges_Table and users table data
3. THE Judge_Invitation_System SHALL preserve existing judge enrollment status during invitation operations
4. WHEN multiple judges exist for the same event, THE system SHALL correctly identify each judge using their unique Primary_Key_Field
5. THE Database_Lookup_Query SHALL enforce that each Primary_Key_Field value corresponds to exactly one judge record per event

### Requirement 4: Frontend-Backend API Contract

**User Story:** As a frontend developer, I want consistent API behavior for judge invitations, so that the interface can reliably trigger invitation workflows.

#### Acceptance Criteria

1. THE frontend SHALL pass the Primary_Key_Field value (`competition_judges.id`) as the judge identifier for invitation requests
2. WHEN the frontend requests a judge invitation, THE backend SHALL accept the Primary_Key_Field as the judge identifier parameter
3. THE API contract SHALL specify that judge identifiers represent Primary_Key_Field values, not Foreign_Key_Field values
4. THE Judge_Invitation_System SHALL return consistent response formats regardless of whether judges are new or existing accounts
5. THE frontend SHALL receive appropriate success/failure responses that align with the corrected database lookup behavior

### Requirement 5: Regression Testing and Verification

**User Story:** As a quality assurance engineer, I want comprehensive testing of the judge invitation fix, so that similar database lookup issues are prevented in the future.

#### Acceptance Criteria

1. WHEN testing judge invitations with enrolled judges, THE system SHALL successfully send invitations without "not enrolled" errors
2. THE testing suite SHALL verify that Primary_Key_Field lookups work correctly for both new and existing judge accounts
3. WHEN testing with invalid judge IDs, THE system SHALL return appropriate error messages without causing system failures
4. THE regression tests SHALL cover scenarios with multiple judges per event to ensure unique identification works correctly
5. THE verification process SHALL confirm that Foreign_Key_Field relationships remain intact after implementing the Primary_Key_Field lookup fix