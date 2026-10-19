-- Run after setup and migration 124 inside the same rollback-only transaction.
DO $$
DECLARE fixture record; ev uuid; state jsonb; result jsonb; calc_id uuid; saved jsonb; digest text; decision jsonb;
BEGIN
 FOR fixture IN SELECT * FROM review_workflow_fixture LOOP
  SELECT event_id INTO ev FROM competitions WHERE id=fixture.child;
  state:=competition_child_tabulation_snapshot(ev,fixture.child,fixture.actor_id,NULL,false);
  IF fixture.legacy THEN
   IF state->'calculation'->>'id' IS DISTINCT FROM fixture.saved->>'id'
    OR state->>'sourceDigest' IS DISTINCT FROM fixture.digest
    OR state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb
    OR state->'calculationStale' IS DISTINCT FROM 'false'::jsonb
    OR (SELECT to_jsonb(c) FROM competition_child_calculations c WHERE c.id=(fixture.saved->>'id')::uuid) IS DISTINCT FROM fixture.saved
   THEN RAISE EXCEPTION 'LEGACY_FINALIZED_CALCULATION_CHANGED'; END IF;
   BEGIN
    PERFORM competition_child_official_calculate(ev,fixture.child,fixture.actor_id,NULL,state->>'sourceDigest','{}','{}');
    RAISE EXCEPTION 'FINALIZED_RECALCULATION_ACCEPTED';
   EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CURRENT_CALCULATION_ALREADY_FINALIZED' THEN RAISE; END IF; END;
   RAISE NOTICE 'PASS legacy digest, frozen result and finalization preserved';
   CONTINUE;
  END IF;
  IF state->'reviewPolicy' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'UNEXPECTED_REVIEWER'; END IF;
  result:=competition_child_official_calculate(ev,fixture.child,fixture.actor_id,NULL,state->>'sourceDigest',jsonb_build_object('rules',jsonb_build_object('id',fixture.rules_id)),jsonb_build_object('ready',true,'results',jsonb_build_array(jsonb_build_object('contestantId',fixture.entry_id,'rank',1,'baseScore',80,'finalScore',80))));
  calc_id:=(result->>'calculationId')::uuid;
  state:=competition_child_tabulation_snapshot(ev,fixture.child,fixture.actor_id,NULL,false);
  IF state->'calculation'->>'id' IS DISTINCT FROM calc_id::text THEN RAISE EXCEPTION 'UNASSIGNED_CALCULATION_NOT_VISIBLE'; END IF;
  digest:=state->>'sourceDigest';
  SELECT to_jsonb(c) INTO saved FROM competition_child_calculations c WHERE c.id=calc_id;
  BEGIN
   PERFORM competition_child_official_transition(ev,fixture.child,fixture.actor_id,calc_id,'verify','Self verification prohibited');
   RAISE EXCEPTION 'SELF_VERIFICATION_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'INDEPENDENT_REVIEWER_FORBIDDEN' THEN RAISE; END IF; END;
  BEGIN
   PERFORM competition_child_official_transition(ev,fixture.child,fixture.actor_id,calc_id,'finalize','Premature finalization prohibited');
   RAISE EXCEPTION 'UNVERIFIED_FINALIZATION_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'INDEPENDENT_VERIFICATION_REQUIRED' THEN RAISE; END IF; END;
  PERFORM competition_child_appoint_reviewer(ev,fixture.child,fixture.actor_id,fixture.reviewer_ep);
  state:=competition_child_tabulation_snapshot(ev,fixture.child,fixture.actor_id,NULL,false);
  IF state->'calculation'->>'id' IS DISTINCT FROM calc_id::text
   OR state->>'sourceDigest' IS DISTINCT FROM digest
   OR (SELECT to_jsonb(c) FROM competition_child_calculations c WHERE c.id=calc_id) IS DISTINCT FROM saved
  THEN RAISE EXCEPTION 'APPOINTMENT_INVALIDATED_CALCULATION'; END IF;
  RAISE NOTICE 'PASS calculate without reviewer, immutable result survives appointment, unverified finalization blocked';
  -- Deduction review still changes numeric inputs and requires recalculation.
  decision:=competition_child_deduction_action(ev,fixture.child,fixture.actor_id,NULL,'propose',jsonb_build_object('entryId',fixture.entry_id,'ruleKey','late','offenseKey','review-workflow-test','reason','Configured deduction fixture'));
  state:=competition_child_tabulation_snapshot(ev,fixture.child,fixture.actor_id,NULL,false);
  IF state->'calculation' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'PENDING_DEDUCTION_RETAINED_CALCULATION'; END IF;
  BEGIN
   PERFORM competition_child_official_calculate(ev,fixture.child,fixture.actor_id,NULL,state->>'sourceDigest','{}','{}');
   RAISE EXCEPTION 'PENDING_DEDUCTION_CALCULATED';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOSED_COMPLETE_RESOLVED_SOURCES_REQUIRED' THEN RAISE; END IF; END;
  PERFORM competition_child_deduction_action(ev,fixture.child,fixture.reviewer_id,NULL,'approve',jsonb_build_object('decisionId',decision->>'decisionId','reason','Independent deduction review'));
  state:=competition_child_tabulation_snapshot(ev,fixture.child,fixture.actor_id,NULL,false);
  result:=competition_child_official_calculate(ev,fixture.child,fixture.actor_id,NULL,state->>'sourceDigest',jsonb_build_object('rules',jsonb_build_object('id',fixture.rules_id)),jsonb_build_object('ready',true,'results',jsonb_build_array(jsonb_build_object('contestantId',fixture.entry_id,'rank',1,'baseScore',80,'deductionTotal',2,'finalScore',78))));
  calc_id:=(result->>'calculationId')::uuid;
  PERFORM competition_child_official_transition(ev,fixture.child,fixture.reviewer_id,calc_id,'verify','Independent result verification');
  PERFORM competition_child_official_transition(ev,fixture.child,fixture.actor_id,calc_id,'finalize','Explicit organizer finalization');
  state:=competition_child_tabulation_snapshot(ev,fixture.child,fixture.actor_id,NULL,false);
  IF state->'calculation'->'finalized' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'VERIFIED_FINALIZATION_FAILED'; END IF;
  UPDATE event_participants SET is_active=false WHERE id=fixture.reviewer_ep;
  state:=competition_child_tabulation_snapshot(ev,fixture.child,fixture.actor_id,NULL,false);
  IF state->'calculation' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'INACTIVE_REVIEWER_RETAINED_FINALIZATION'; END IF;
  UPDATE event_participants SET is_active=true WHERE id=fixture.reviewer_ep;
  RAISE NOTICE 'PASS configured deductions block calculation; independent verification and active-reviewer finalization enforced';
 END LOOP;
END $$;
