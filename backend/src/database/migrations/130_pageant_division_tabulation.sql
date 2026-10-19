-- Pageant placements and advancement are independent within each division.
-- New source fingerprints invalidate combined calculations without rewriting
-- historical submissions, calculations, reviews or publications.
BEGIN;
SET LOCAL search_path=public;
DO $$ BEGIN
 IF to_regprocedure('competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb)') IS NULL
 OR to_regprocedure('competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean)') IS NULL
 OR to_regprocedure('competition_child_public_projection(uuid)') IS NULL
 THEN RAISE EXCEPTION 'MIGRATIONS_124_126_AND_127_REQUIRED'; END IF;
 IF to_regprocedure('competition_child_tabulation_snapshot_v130(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN
  ALTER FUNCTION competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) RENAME TO competition_child_tabulation_snapshot_v130;
 END IF;
 IF to_regprocedure('competition_child_public_projection_v130(uuid)') IS NULL THEN
  ALTER FUNCTION competition_child_public_projection(uuid) RENAME TO competition_child_public_projection_v130;
 END IF;
 IF to_regprocedure('competition_child_official_calculate_v130(uuid,uuid,uuid,uuid,text,jsonb,jsonb)') IS NULL THEN
  ALTER FUNCTION competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb) RENAME TO competition_child_official_calculate_v130;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_child_official_calculate(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_digest text,p_input jsonb,p_output jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb;
BEGIN
 state:=competition_child_tabulation_snapshot(p_event,p_competition,p_actor,p_round,false);
 IF state->'divisionRanking'->>'mode'='division' AND (
  p_input->'rules'->'scoringConfig'->'perDivision' IS DISTINCT FROM 'true'::jsonb
  OR p_output->'divisionRanking' IS DISTINCT FROM state->'divisionRanking'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_output->'results') r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(state->'divisionRanking'->'entries') e WHERE e->>'entryId'=r->>'contestantId' AND e->>'divisionId'=r->>'divisionId'))
 ) THEN RAISE EXCEPTION 'PAGEANT_DIVISION_CALCULATION_REQUIRED'; END IF;
 RETURN competition_child_official_calculate_v130(p_event,p_competition,p_actor,p_round,p_digest,p_input,p_output);
END $$;

CREATE OR REPLACE FUNCTION competition_child_tabulation_snapshot(p_event uuid,p_competition uuid,p_actor uuid,p_round uuid,p_reviewer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; divisions jsonb; members jsonb; scope jsonb; evidence jsonb; digest text; calc competition_child_calculations; policy_active boolean;
BEGIN
 state:=competition_child_tabulation_snapshot_v130(p_event,p_competition,p_actor,p_round,p_reviewer);
 IF NOT EXISTS(SELECT 1 FROM competitions WHERE id=p_competition AND event_id=p_event AND competition_type='pageant')
 OR state->'complete' IS DISTINCT FROM 'true'::jsonb THEN RETURN state; END IF;
 -- Existing setup/input-revision guards still govern the frozen participation
 -- roster. Division identity is now also part of its calculation evidence.
 SELECT coalesce(jsonb_agg(jsonb_build_object('entryId',e.id,'divisionId',d.id,'divisionName',d.name,'contestantNumber',m.contestant_number) ORDER BY e.id),'[]') INTO members
 FROM jsonb_array_elements(state->'rules'->'participation_snapshot') frozen
 JOIN competition_entries e ON e.id=(frozen->>'id')::uuid AND e.competition_id=p_competition
 JOIN competition_contestants m ON m.id=e.contestant_id AND m.event_id=p_event
 LEFT JOIN competition_divisions d ON d.id=m.division_id AND d.event_id=p_event;
 IF jsonb_array_length(members)<>jsonb_array_length(state->'rules'->'participation_snapshot')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(members) item WHERE item->>'divisionId' IS NULL)
 THEN RAISE EXCEPTION 'PAGEANT_CONTESTANT_DIVISION_REQUIRED'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) ORDER BY d.display_order,d.id),'[]') INTO divisions
 FROM competition_divisions d WHERE d.event_id=p_event AND EXISTS(SELECT 1 FROM jsonb_array_elements(members) m WHERE m->>'divisionId'=d.id::text);
 scope:=jsonb_build_object('mode','division','version',1,'divisions',divisions,'entries',members);
 evidence:=state->'evidence'||jsonb_build_object('divisionRanking',scope);
 digest:=encode(sha256(convert_to((evidence-'policy')::text,'UTF8')),'hex');
 SELECT * INTO calc FROM competition_child_calculations WHERE competition_id=p_competition AND round_id IS NOT DISTINCT FROM p_round ORDER BY version DESC LIMIT 1;
 policy_active:=coalesce(state->'reviewPolicy'->'active'='true'::jsonb,false);
 RETURN state||jsonb_build_object('divisionRanking',scope,'evidence',evidence,'sourceDigest',digest,
  'entries',(SELECT coalesce(jsonb_agg(e||jsonb_build_object('divisionId',m->'divisionId','divisionName',m->'divisionName','contestantNumber',m->'contestantNumber') ORDER BY m->>'divisionId',(m->>'contestantNumber')::integer),'[]') FROM jsonb_array_elements(state->'entries') e JOIN jsonb_array_elements(members) m ON e->>'id'=m->>'entryId'),
  'calculationStale',calc.id IS NOT NULL AND calc.source_digest IS DISTINCT FROM digest,
  'calculation',CASE WHEN state->'deductionsResolved'='true'::jsonb AND state->'session'->>'status'='closed' AND calc.source_digest=digest AND (policy_active OR NOT EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calc.id)) THEN to_jsonb(calc)||jsonb_build_object('verified',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calc.id AND action='verify'),'finalized',EXISTS(SELECT 1 FROM competition_child_calculation_transitions WHERE calculation_id=calc.id AND action='finalize')) ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION competition_child_division_qualifiers(p_results jsonb,p_definition jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 WITH ranked AS (
  SELECT r, r->>'divisionId' AS division_id,(r->>'rank')::numeric AS rank,
   row_number() OVER(PARTITION BY r->>'divisionId' ORDER BY (r->>'rank')::numeric,r->>'contestantId') AS entry_order,
   count(*) OVER(PARTITION BY r->>'divisionId') AS group_size
  FROM jsonb_array_elements(p_results) r
 ), cutoffs AS (
  SELECT division_id,max(rank) AS cutoff FROM ranked
  WHERE entry_order=least(group_size,CASE WHEN p_definition->>'advancementType'='top_n' THEN (p_definition->>'advancementValue')::integer ELSE ceil(group_size*(p_definition->>'advancementValue')::numeric/100)::integer END)
  GROUP BY division_id
 ) SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') FROM ranked JOIN cutoffs USING(division_id) WHERE rank<=cutoff
$$;

DO $$ DECLARE definition text; before text; after text; BEGIN
 definition:=pg_get_functiondef('competition_child_confirm_qualification(uuid,uuid,uuid,uuid,uuid,text,jsonb,text,boolean)'::regprocedure);
 IF position('competition_child_division_qualifiers' IN definition)=0 THEN
  before:=$old$  n:=CASE WHEN kind='top_n' THEN (definition->>'advancementValue')::integer ELSE ceil(jsonb_array_length(results)*(definition->>'advancementValue')::numeric/100)::integer END;
  SELECT (r->>'rank')::numeric INTO cutoff FROM jsonb_array_elements(results) r ORDER BY (r->>'rank')::numeric OFFSET greatest(0,least(n,jsonb_array_length(results))-1) LIMIT 1;
  SELECT coalesce(jsonb_agg(r->>'contestantId' ORDER BY r->>'contestantId'),'[]') INTO expected FROM jsonb_array_elements(results) r WHERE (r->>'rank')::numeric<=cutoff;$old$;
  after:='  IF state->''divisionRanking''->>''mode''=''division'' THEN expected:=competition_child_division_qualifiers(results,definition); ELSE '||before||' END IF;';
  IF position(before IN definition)=0 THEN RAISE EXCEPTION 'QUALIFICATION_GUARD_NOT_FOUND'; END IF;
  EXECUTE replace(definition,before,after);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION competition_child_public_projection(p_calculation uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE projection jsonb; output jsonb;
BEGIN
 projection:=competition_child_public_projection_v130(p_calculation);
 SELECT output_snapshot INTO output FROM competition_child_calculations WHERE id=p_calculation;
 IF output->'divisionRanking'->>'mode' IS DISTINCT FROM 'division' THEN RETURN projection; END IF;
 RETURN projection||jsonb_build_object('divisionRanking',jsonb_build_object('mode','division','divisions',output->'divisionRanking'->'divisions'),
  'standings',(SELECT coalesce(jsonb_agg(s||jsonb_build_object('divisionId',r->'divisionId','divisionName',r->'divisionName','entryNumber',r->'contestantNumber','tied',(SELECT count(*)>1 FROM jsonb_array_elements(output->'results') peer WHERE peer->'divisionId'=r->'divisionId' AND peer->'rank'=r->'rank')) ORDER BY r->>'divisionId',(r->>'rank')::integer),'[]') FROM jsonb_array_elements(projection->'standings') s JOIN jsonb_array_elements(output->'results') r ON s->>'participationId'=r->>'contestantId'));
END $$;

REVOKE ALL ON FUNCTION competition_child_tabulation_snapshot_v130(uuid,uuid,uuid,uuid,boolean),competition_child_public_projection_v130(uuid),competition_child_public_projection(uuid),competition_child_division_qualifiers(jsonb,jsonb),competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION competition_child_official_calculate_v130(uuid,uuid,uuid,uuid,text,jsonb,jsonb),competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION competition_child_official_calculate(uuid,uuid,uuid,uuid,text,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION competition_child_tabulation_snapshot(uuid,uuid,uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
