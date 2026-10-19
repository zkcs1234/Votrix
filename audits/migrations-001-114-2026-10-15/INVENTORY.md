# Complete migration inventory: 001–114

Captured from the current files. Raw replay PASS means execution succeeded in the tested sequence; it does not certify every business rule or a populated upgrade. Rollbacks were inventoried and source-inspected, not executed. Full SHA256 values are in replay.json.

| Number | File | Direction | Raw execution | SQL functions declared | Transaction pair | SHA256 prefix |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | [001_initial_schema.sql](../../backend/src/database/migrations/001_initial_schema.sql) | forward | PASS | 1 | No | f5fdee6885774816 |
| 002 | [002_down_initial_schema.sql](../../backend/src/database/migrations/002_down_initial_schema.sql) | rollback | Not executed | 0 | No | a9b846469d343099 |
| 003 | [003_password_reset_tokens.sql](../../backend/src/database/migrations/003_password_reset_tokens.sql) | forward | PASS | 0 | No | 4fbaa06f0d83913b |
| 004 | [004_election_module.sql](../../backend/src/database/migrations/004_election_module.sql) | forward | PASS | 0 | No | 9748586127300b04 |
| 005 | [005_pageant_module.sql](../../backend/src/database/migrations/005_pageant_module.sql) | forward | PASS | 0 | No | c22675343e42ec99 |
| 006 | [006_polling_module.sql](../../backend/src/database/migrations/006_polling_module.sql) | forward | PASS | 0 | No | e78908435491a8b0 |
| 007 | [007_organization_logo.sql](../../backend/src/database/migrations/007_organization_logo.sql) | forward | PASS | 0 | No | 5a5202c4b544fcae |
| 008 | [008_admin_dashboard.sql](../../backend/src/database/migrations/008_admin_dashboard.sql) | forward | PASS | 0 | No | bd0abb777ff1dbc3 |
| 009 | [009_user_account_status.sql](../../backend/src/database/migrations/009_user_account_status.sql) | forward | PASS | 0 | No | 26125598d0d2e804 |
| 010 | [010_notifications.sql](../../backend/src/database/migrations/010_notifications.sql) | forward | PASS | 0 | No | cda4e272cfe4132e |
| 011 | [011_rename_pageant_to_competition_scoring.sql](../../backend/src/database/migrations/011_rename_pageant_to_competition_scoring.sql) | forward | FAIL; scratch repair applied | 0 | Yes | 7d55bce20d0c503c |
| 012 | [012_down_rename_pageant_to_competition_scoring.sql](../../backend/src/database/migrations/012_down_rename_pageant_to_competition_scoring.sql) | rollback | Not executed | 0 | Yes | 07b736802cbc3f9c |
| 013 | [013_election_enhancements.sql](../../backend/src/database/migrations/013_election_enhancements.sql) | forward | PASS | 0 | Yes | cc09ab24a796ac92 |
| 014 | [014_down_election_enhancements.sql](../../backend/src/database/migrations/014_down_election_enhancements.sql) | rollback | Not executed | 0 | Yes | 24c1e41d7eb27da1 |
| 015 | [015_competition_scoring_foundation.sql](../../backend/src/database/migrations/015_competition_scoring_foundation.sql) | forward | PASS | 0 | Yes | b64bf73133665ca4 |
| 016 | [016_competition_scoring_foundation_down.sql](../../backend/src/database/migrations/016_competition_scoring_foundation_down.sql) | rollback | Not executed | 0 | Yes | 0fb4df3de444c4b5 |
| 017 | [017_polling_question_type_registry.sql](../../backend/src/database/migrations/017_polling_question_type_registry.sql) | forward | PASS | 0 | Yes | 3f32098d5ee22b77 |
| 018 | [018_performance_indexes.sql](../../backend/src/database/migrations/018_performance_indexes.sql) | forward | PASS | 0 | No | f0518839bce28828 |
| 018 | [018_polling_question_type_registry_down.sql](../../backend/src/database/migrations/018_polling_question_type_registry_down.sql) | rollback | Not executed | 0 | Yes | 9f0ffa43348e21ff |
| 019 | [019_phase9_indexes_and_optimizations.sql](../../backend/src/database/migrations/019_phase9_indexes_and_optimizations.sql) | forward | PASS | 0 | Yes | 0279d836453d2859 |
| 020 | [020_phase9_indexes_and_optimizations_down.sql](../../backend/src/database/migrations/020_phase9_indexes_and_optimizations_down.sql) | rollback | Not executed | 0 | Yes | 45b77efd6759ec4c |
| 021 | [021_token_version.sql](../../backend/src/database/migrations/021_token_version.sql) | forward | PASS | 0 | No | 054164aed3175b5a |
| 022 | [022_invitation_is_new_account.sql](../../backend/src/database/migrations/022_invitation_is_new_account.sql) | forward | PASS | 0 | No | c61b438153e12eb0 |
| 023 | [023_competition_live_session.sql](../../backend/src/database/migrations/023_competition_live_session.sql) | forward | PASS | 0 | Yes | 60d995653da8729a |
| 023 | [023_competition_live_session_down.sql](../../backend/src/database/migrations/023_competition_live_session_down.sql) | rollback | Not executed | 0 | Yes | ba024d5022b2f3e7 |
| 027 | [027_polling_completion_time.sql](../../backend/src/database/migrations/027_polling_completion_time.sql) | forward | PASS | 0 | No | 0bf2e7cc84978a50 |
| 028 | [028_down_single_organization_per_organizer.sql](../../backend/src/database/migrations/028_down_single_organization_per_organizer.sql) | rollback | Not executed | 0 | Yes | be1ceab8e71bc2c1 |
| 028 | [028_single_organization_per_organizer.sql](../../backend/src/database/migrations/028_single_organization_per_organizer.sql) | forward | PASS | 0 | Yes | 1b6dc09d620aac6b |
| 029 | [029_down_event_participant_roles.sql](../../backend/src/database/migrations/029_down_event_participant_roles.sql) | rollback | Not executed | 0 | Yes | 0b69c9d2cfd0b8e7 |
| 029 | [029_event_participant_roles.sql](../../backend/src/database/migrations/029_event_participant_roles.sql) | forward | PASS | 1 | Yes | a29be110276c7c21 |
| 030 | [030_down_event_information_form_schema.sql](../../backend/src/database/migrations/030_down_event_information_form_schema.sql) | rollback | Not executed | 0 | Yes | 77acb5dc1af4e00c |
| 030 | [030_event_information_form_schema.sql](../../backend/src/database/migrations/030_event_information_form_schema.sql) | forward | FAIL; scratch repair applied | 0 | Yes | 986fd5638073a609 |
| 030 | [030_participant_info_fields.sql](../../backend/src/database/migrations/030_participant_info_fields.sql) | forward | PASS | 0 | Yes | 1a8c392f32571541 |
| 031 | [031_down_organizer_onboarding_profile.sql](../../backend/src/database/migrations/031_down_organizer_onboarding_profile.sql) | rollback | Not executed | 0 | Yes | 664416cc508e7f31 |
| 031 | [031_organizer_onboarding_profile.sql](../../backend/src/database/migrations/031_organizer_onboarding_profile.sql) | forward | PASS | 0 | Yes | 6b1f180d665e9964 |
| 031 | [031_polling_image_support.sql](../../backend/src/database/migrations/031_polling_image_support.sql) | forward | PASS | 0 | No | 9b57a46faaf4f26b |
| 032 | [032_down_election_further_enhancements.sql](../../backend/src/database/migrations/032_down_election_further_enhancements.sql) | rollback | Not executed | 0 | Yes | 2a780fa649444691 |
| 032 | [032_election_further_enhancements.sql](../../backend/src/database/migrations/032_election_further_enhancements.sql) | forward | PASS | 0 | Yes | 35c73bd0a61598d8 |
| 033 | [033_fix_voter_registration_participants.sql](../../backend/src/database/migrations/033_fix_voter_registration_participants.sql) | forward | PASS | 0 | Yes | ac3dd49a0eec5d8d |
| 034 | [034_down_event_drafts.sql](../../backend/src/database/migrations/034_down_event_drafts.sql) | rollback | Not executed | 0 | Yes | e626cfdff954adbd |
| 034 | [034_event_drafts.sql](../../backend/src/database/migrations/034_event_drafts.sql) | forward | PASS | 0 | Yes | 5551c232e27de762 |
| 035 | [035_down_user_sessions.sql](../../backend/src/database/migrations/035_down_user_sessions.sql) | rollback | Not executed | 0 | No | 2e0d4407e5a03d6c |
| 035 | [035_user_sessions.sql](../../backend/src/database/migrations/035_user_sessions.sql) | forward | PASS | 0 | No | 2b5fd489ff2b5a1e |
| 036 | [036_down_event_archived_at.sql](../../backend/src/database/migrations/036_down_event_archived_at.sql) | rollback | Not executed | 0 | No | b6ef1a61c1489a02 |
| 036 | [036_event_archived_at.sql](../../backend/src/database/migrations/036_event_archived_at.sql) | forward | PASS | 0 | No | be0dfbfdef5fd455 |
| 037 | [037_down_image_assets_schema.sql](../../backend/src/database/migrations/037_down_image_assets_schema.sql) | rollback | Not executed | 0 | No | fe506b8d787ca373 |
| 037 | [037_image_assets_schema.sql](../../backend/src/database/migrations/037_image_assets_schema.sql) | forward | PASS | 0 | No | a3cde674bdf06e49 |
| 038 | [038_competition_divisions.sql](../../backend/src/database/migrations/038_competition_divisions.sql) | forward | FAIL; scratch repair applied | 4 | Yes | 88ce4f5b6ae25f19 |
| 038 | [038_down_competition_divisions.sql](../../backend/src/database/migrations/038_down_competition_divisions.sql) | rollback | Not executed | 0 | Yes | 28aac3ec8f389092 |
| 038 | [038_fix_competition_tables_event_id.sql](../../backend/src/database/migrations/038_fix_competition_tables_event_id.sql) | forward | 038 prerequisite applied before retry | 0 | Yes | bbfca2c3643793f3 |
| 039 | [039_down_per_division_contestant_number.sql](../../backend/src/database/migrations/039_down_per_division_contestant_number.sql) | rollback | Not executed | 0 | Yes | f25f3411fbec0b8e |
| 039 | [039_per_division_contestant_number.sql](../../backend/src/database/migrations/039_per_division_contestant_number.sql) | forward | FAIL; scratch repair applied | 0 | Yes | 9bb3a39bf30db224 |
| 040 | [040_down_reconcile_event_participants.sql](../../backend/src/database/migrations/040_down_reconcile_event_participants.sql) | rollback | Not executed | 0 | Yes | 5e821fff0c4a5aa0 |
| 040 | [040_reconcile_event_participants.sql](../../backend/src/database/migrations/040_reconcile_event_participants.sql) | forward | PASS | 0 | Yes | 1ef127ac9acf9b6c |
| 041 | [041_down_unify_competition_judges.sql](../../backend/src/database/migrations/041_down_unify_competition_judges.sql) | rollback | Not executed | 0 | Yes | cb9f1affa7392597 |
| 041 | [041_unify_competition_judges.sql](../../backend/src/database/migrations/041_unify_competition_judges.sql) | forward | PASS | 0 | Yes | ff63a1c71da8dc98 |
| 055 | [055_competition_performance_indexes.sql](../../backend/src/database/migrations/055_competition_performance_indexes.sql) | forward | PASS | 0 | Yes | 79cbc773381826db |
| 056 | [056_down_competition_performance_indexes.sql](../../backend/src/database/migrations/056_down_competition_performance_indexes.sql) | rollback | Not executed | 0 | Yes | 922ec199b96cf3e9 |
| 057 | [057_competition_type.sql](../../backend/src/database/migrations/057_competition_type.sql) | forward | PASS | 0 | No | 249bdbd0f3c15e13 |
| 057 | [057_down_competition_type.sql](../../backend/src/database/migrations/057_down_competition_type.sql) | rollback | Not executed | 0 | No | 230269ccf19323f7 |
| 058 | [058_down_round_advancement.sql](../../backend/src/database/migrations/058_down_round_advancement.sql) | rollback | Not executed | 0 | No | 09a8e533015d581f |
| 058 | [058_round_advancement.sql](../../backend/src/database/migrations/058_round_advancement.sql) | forward | PASS | 0 | No | 2a43b49b78118e61 |
| 059 | [059_down_election_cast_ballot_rpc.sql](../../backend/src/database/migrations/059_down_election_cast_ballot_rpc.sql) | rollback | Not executed | 0 | No | 85d6541fa7983f75 |
| 059 | [059_election_cast_ballot_rpc.sql](../../backend/src/database/migrations/059_election_cast_ballot_rpc.sql) | forward | PASS | 1 | Yes | b74ee014b0ee250d |
| 059 | [059_stage_group.sql](../../backend/src/database/migrations/059_stage_group.sql) | forward | PASS | 0 | No | d74706093b642b07 |
| 059 | [059_stage_group_down.sql](../../backend/src/database/migrations/059_stage_group_down.sql) | rollback | Not executed | 0 | No | f91f6dca92c028c4 |
| 060 | [060_down_poll_cast_response_rpc.sql](../../backend/src/database/migrations/060_down_poll_cast_response_rpc.sql) | rollback | Not executed | 0 | No | 751c52046175d8bf |
| 060 | [060_poll_cast_response_rpc.sql](../../backend/src/database/migrations/060_poll_cast_response_rpc.sql) | forward | PASS | 1 | Yes | 820e8e84c07a7311 |
| 061 | [061_add_participant_id_to_ballots.sql](../../backend/src/database/migrations/061_add_participant_id_to_ballots.sql) | forward | PASS | 0 | Yes | d6c0efab5eb74cb0 |
| 061 | [061_down_add_participant_id_to_ballots.sql](../../backend/src/database/migrations/061_down_add_participant_id_to_ballots.sql) | rollback | Not executed | 0 | Yes | 893b93c51309ee48 |
| 062 | [062_down_validate_participant_id_fks.sql](../../backend/src/database/migrations/062_down_validate_participant_id_fks.sql) | rollback | Not executed | 0 | Yes | 75e82118d520d7ef |
| 062 | [062_validate_participant_id_fks.sql](../../backend/src/database/migrations/062_validate_participant_id_fks.sql) | forward | PASS | 0 | Yes | 6cedcada450c624a |
| 063 | [063_down_judge_assignment_scope_guard.sql](../../backend/src/database/migrations/063_down_judge_assignment_scope_guard.sql) | rollback | Not executed | 0 | Yes | aaa4560c406976e9 |
| 063 | [063_judge_assignment_scope_guard.sql](../../backend/src/database/migrations/063_judge_assignment_scope_guard.sql) | forward | PASS | 1 | Yes | 30b65239927e14e6 |
| 064 | [064_autofill_participant_id.sql](../../backend/src/database/migrations/064_autofill_participant_id.sql) | forward | PASS | 4 | Yes | 4ba7cc2aba392f19 |
| 064 | [064_down_autofill_participant_id.sql](../../backend/src/database/migrations/064_down_autofill_participant_id.sql) | rollback | Not executed | 0 | Yes | a60f581d30181edb |
| 065 | [065_down_participant_id_not_null.sql](../../backend/src/database/migrations/065_down_participant_id_not_null.sql) | rollback | Not executed | 0 | Yes | f3c545b554810afa |
| 065 | [065_participant_id_not_null.sql](../../backend/src/database/migrations/065_participant_id_not_null.sql) | forward | PASS | 0 | Yes | 88fdf8b060259e89 |
| 066 | [066_competition_awards.sql](../../backend/src/database/migrations/066_competition_awards.sql) | forward | PASS | 0 | No | a4ad433c5945615c |
| 066 | [066_down_competition_awards.sql](../../backend/src/database/migrations/066_down_competition_awards.sql) | rollback | Not executed | 0 | No | 2202a9d5a301ade4 |
| 067 | [067_award_selections.sql](../../backend/src/database/migrations/067_award_selections.sql) | forward | PASS | 0 | No | 6eb687f10f59eff4 |
| 067 | [067_down_award_selections.sql](../../backend/src/database/migrations/067_down_award_selections.sql) | rollback | Not executed | 0 | No | 10456630d09efdc9 |
| 068 | [068_down_remove_competition_awards.sql](../../backend/src/database/migrations/068_down_remove_competition_awards.sql) | rollback | Not executed | 0 | No | 963ca5b542bdd479 |
| 068 | [068_remove_competition_awards.sql](../../backend/src/database/migrations/068_remove_competition_awards.sql) | forward | PASS | 0 | No | 477e9ba5c9cfad3e |
| 071 | [071_down_minor_criteria.sql](../../backend/src/database/migrations/071_down_minor_criteria.sql) | rollback | Not executed | 0 | Yes | 40fcca2cfb8e1393 |
| 071 | [071_minor_criteria.sql](../../backend/src/database/migrations/071_minor_criteria.sql) | forward | PASS | 0 | Yes | c7ea376a71a154f0 |
| 072 | [072_down_session_active_criteria.sql](../../backend/src/database/migrations/072_down_session_active_criteria.sql) | rollback | Not executed | 0 | Yes | b4200bddd01b5a7c |
| 072 | [072_session_active_criteria.sql](../../backend/src/database/migrations/072_session_active_criteria.sql) | forward | PASS | 0 | Yes | b861b70bbd4da239 |
| 073 | [073_down_session_locked_criteria.sql](../../backend/src/database/migrations/073_down_session_locked_criteria.sql) | rollback | Not executed | 0 | Yes | e2a756473a3125fc |
| 073 | [073_session_locked_criteria.sql](../../backend/src/database/migrations/073_session_locked_criteria.sql) | forward | PASS | 0 | Yes | f1929f5e97a134d5 |
| 074 | [074_down_participant_type_composite_indexes.sql](../../backend/src/database/migrations/074_down_participant_type_composite_indexes.sql) | rollback | Not executed | 0 | No | 12a663c95f91adf9 |
| 074 | [074_participant_type_composite_indexes.sql](../../backend/src/database/migrations/074_participant_type_composite_indexes.sql) | forward | PASS | 0 | No | b03fbdaa3d9d2d76 |
| 075 | [075_down_participant_profiles.sql](../../backend/src/database/migrations/075_down_participant_profiles.sql) | rollback | Not executed | 0 | Yes | 265b74e2c2c62017 |
| 075 | [075_participant_profiles.sql](../../backend/src/database/migrations/075_participant_profiles.sql) | forward | PASS | 0 | Yes | 3803a3a974595d01 |
| 076 | [076_down_organizer_scope.sql](../../backend/src/database/migrations/076_down_organizer_scope.sql) | rollback | Not executed | 0 | Yes | 4ef4a6a090dce8dd |
| 076 | [076_organizer_scope.sql](../../backend/src/database/migrations/076_organizer_scope.sql) | forward | PASS | 0 | Yes | fafc4d1fc07edf94 |
| 077 | [077_down_remove_user_session_metadata.sql](../../backend/src/database/migrations/077_down_remove_user_session_metadata.sql) | rollback | Not executed | 0 | Yes | ccd482bd85ea1005 |
| 077 | [077_remove_user_session_metadata.sql](../../backend/src/database/migrations/077_remove_user_session_metadata.sql) | forward | PASS | 0 | Yes | 8b1d2602aa071d57 |
| 078 | [078_down_election_ballot_sections.sql](../../backend/src/database/migrations/078_down_election_ballot_sections.sql) | rollback | Not executed | 0 | Yes | af49c7785f48f6b8 |
| 078 | [078_election_ballot_sections.sql](../../backend/src/database/migrations/078_election_ballot_sections.sql) | forward | PASS | 1 | Yes | 1202659b73ae11d3 |
| 079 | [079_down_election_section_cast_ballot_rpc.sql](../../backend/src/database/migrations/079_down_election_section_cast_ballot_rpc.sql) | rollback | Not executed | 1 | Yes | aa17d545f1200794 |
| 079 | [079_election_section_cast_ballot_rpc.sql](../../backend/src/database/migrations/079_election_section_cast_ballot_rpc.sql) | forward | PASS | 2 | Yes | 8532bfcd61a31db4 |
| 080 | [080_competition_session_arrangement.sql](../../backend/src/database/migrations/080_competition_session_arrangement.sql) | forward | PASS | 0 | No | a23cc9590ffcc86b |
| 080 | [080_down_competition_session_arrangement.sql](../../backend/src/database/migrations/080_down_competition_session_arrangement.sql) | rollback | Not executed | 0 | No | 2c882f847f97d0bc |
| 080 | [080_election_groups.sql](../../backend/src/database/migrations/080_election_groups.sql) | forward | PASS | 4 | Yes | 3cc4ff73ec0f9a5b |
| 081 | [081_competition_deductions.sql](../../backend/src/database/migrations/081_competition_deductions.sql) | forward | PASS | 0 | No | f194708cb52e241b |
| 081 | [081_down_competition_deductions.sql](../../backend/src/database/migrations/081_down_competition_deductions.sql) | rollback | Not executed | 0 | No | d4eea758895e1943 |
| 082 | [082_competition_result_calculations.sql](../../backend/src/database/migrations/082_competition_result_calculations.sql) | forward | PASS | 0 | No | f0d1b20121568265 |
| 082 | [082_down_competition_result_calculations.sql](../../backend/src/database/migrations/082_down_competition_result_calculations.sql) | rollback | Not executed | 0 | No | b5100f2205d1a060 |
| 083 | [083_add_participant_user_role.sql](../../backend/src/database/migrations/083_add_participant_user_role.sql) | forward | PASS | 0 | No | 37decfd17fe37a89 |
| 083 | [083_down_add_participant_user_role.sql](../../backend/src/database/migrations/083_down_add_participant_user_role.sql) | rollback | Not executed | 0 | Yes | 41a7029d3347fcd1 |
| 084 | [084_down_user_participant_type_memberships.sql](../../backend/src/database/migrations/084_down_user_participant_type_memberships.sql) | rollback | Not executed | 0 | Yes | 21fb36aa71b61a69 |
| 084 | [084_user_participant_type_memberships.sql](../../backend/src/database/migrations/084_user_participant_type_memberships.sql) | forward | PASS | 0 | Yes | 0e65f8e7b4f0f6d9 |
| 085 | [085_convert_voter_role_to_participant.sql](../../backend/src/database/migrations/085_convert_voter_role_to_participant.sql) | forward | PASS | 0 | Yes | 2bb8fee3b2fecb3e |
| 085 | [085_down_convert_voter_role_to_participant.sql](../../backend/src/database/migrations/085_down_convert_voter_role_to_participant.sql) | rollback | Not executed | 0 | Yes | 1ddf2de04de67f1a |
| 086 | [086_down_drop_legacy_profile_type.sql](../../backend/src/database/migrations/086_down_drop_legacy_profile_type.sql) | rollback | Not executed | 0 | Yes | c456bbadeda22f37 |
| 086 | [086_drop_legacy_profile_type.sql](../../backend/src/database/migrations/086_drop_legacy_profile_type.sql) | forward | PASS | 0 | Yes | 007a760cf6a260c3 |
| 087 | [087_competition_workflow.sql](../../backend/src/database/migrations/087_competition_workflow.sql) | forward | PASS | 3 | Yes | 3604eacd9966b9e4 |
| 088 | [088_competition_operations.sql](../../backend/src/database/migrations/088_competition_operations.sql) | forward | PASS | 6 | Yes | 65219651f09c6eba |
| 089 | [089_competition_verification.sql](../../backend/src/database/migrations/089_competition_verification.sql) | forward | PASS | 1 | Yes | e0fbb37d4e5dd8cf |
| 090 | [090_competition_amendments.sql](../../backend/src/database/migrations/090_competition_amendments.sql) | forward | PASS | 1 | Yes | a406d98927617b48 |
| 091 | [091_competition_atomic_setup.sql](../../backend/src/database/migrations/091_competition_atomic_setup.sql) | forward | PASS | 2 | Yes | 2ddef04df22159ac |
| 092 | [092_competition_input_invalidation.sql](../../backend/src/database/migrations/092_competition_input_invalidation.sql) | forward | PASS | 1 | Yes | 7fdf29bf562b3747 |
| 093 | [093_competition_source_history.sql](../../backend/src/database/migrations/093_competition_source_history.sql) | forward | PASS | 2 | Yes | 971108cb56fe535a |
| 094 | [094_competition_projection_reconciliation.sql](../../backend/src/database/migrations/094_competition_projection_reconciliation.sql) | forward | PASS | 1 | Yes | 7c42dbd466165165 |
| 095 | [095_competition_criteria_publication_guard.sql](../../backend/src/database/migrations/095_competition_criteria_publication_guard.sql) | forward | PASS | 2 | Yes | 1e6fbcfe72ce746f |
| 096 | [096_competition_participation_guards.sql](../../backend/src/database/migrations/096_competition_participation_guards.sql) | forward | PASS | 11 | Yes | b9837b3ca6078680 |
| 097 | [097_competition_round_progression.sql](../../backend/src/database/migrations/097_competition_round_progression.sql) | forward | PASS | 14 | Yes | bbbee13ded9f4263 |
| 098 | [098_repair_event_participants_event_fk.sql](../../backend/src/database/migrations/098_repair_event_participants_event_fk.sql) | forward | PASS | 0 | Yes | 57d1fce33f41c4e4 |
| 099 | [099_competition_round_progression_upgrade.sql](../../backend/src/database/migrations/099_competition_round_progression_upgrade.sql) | forward | PASS | 14 | Yes | 0651380609344f3d |
| 100 | [100_competition_atomic_integrity.sql](../../backend/src/database/migrations/100_competition_atomic_integrity.sql) | forward | PASS | 10 | Yes | bbc40a2291a22de0 |
| 101 | [101_competition_private_access.sql](../../backend/src/database/migrations/101_competition_private_access.sql) | forward | PASS | 0 | Yes | 3cd96fbc44efd232 |
| 102 | [102_competition_creation_idempotency.sql](../../backend/src/database/migrations/102_competition_creation_idempotency.sql) | forward | PASS | 1 | Yes | 0baf3cdbd4c06fc6 |
| 103 | [103_competition_child_identity.sql](../../backend/src/database/migrations/103_competition_child_identity.sql) | forward | PASS | 5 | Yes | 4c236303ac34287f |
| 104 | [104_competition_scoped_rules.sql](../../backend/src/database/migrations/104_competition_scoped_rules.sql) | forward | PASS | 12 | Yes | f45c91b094f30252 |
| 105 | [105_competition_scoped_scoring.sql](../../backend/src/database/migrations/105_competition_scoped_scoring.sql) | forward | PASS | 7 | Yes | bea487c104be99b3 |
| 106 | [106_competition_scoped_tabulation.sql](../../backend/src/database/migrations/106_competition_scoped_tabulation.sql) | forward | PASS | 17 | Yes | 6eafe2468c43ce44 |
| 107 | [107_competition_scoped_results.sql](../../backend/src/database/migrations/107_competition_scoped_results.sql) | forward | PASS | 6 | Yes | b5e5802e936f8c75 |
| 108 | [108_competition_navigation_draft_tools.sql](../../backend/src/database/migrations/108_competition_navigation_draft_tools.sql) | forward | PASS | 2 | Yes | bdbcf6e432a22cae |
| 109 | [109_competition_full_foundation_compatibility.sql](../../backend/src/database/migrations/109_competition_full_foundation_compatibility.sql) | forward | PASS | 2 | Yes | b60ac64eb4862fda |
| 110 | [110_competition_creation_flow.sql](../../backend/src/database/migrations/110_competition_creation_flow.sql) | forward | PASS | 5 | Yes | 9c3869c4191220b0 |
| 111 | [111_competition_weighted_minors.sql](../../backend/src/database/migrations/111_competition_weighted_minors.sql) | forward | PASS | 3 | Yes | 7a5a7727c21edda3 |
| 112 | [112_competition_numeric_rank_carry.sql](../../backend/src/database/migrations/112_competition_numeric_rank_carry.sql) | forward | PASS | 2 | Yes | 2adad9fa3bec6fb7 |
| 113 | [113_competition_rank_point_deductions.sql](../../backend/src/database/migrations/113_competition_rank_point_deductions.sql) | forward | PASS | 2 | Yes | 157945a10efd2dc0 |
| 114 | [114_competition_judge_setup_order.sql](../../backend/src/database/migrations/114_competition_judge_setup_order.sql) | forward | PASS | 1 | Yes | 37a829a18580c118 |
