-- Isolated fixture only. Existing planned Final memberships predate 096.
INSERT INTO users(id,role) VALUES('10000000-0000-0000-0000-000000000001','organizer'),('10000000-0000-0000-0000-000000000002','participant'),('10000000-0000-0000-0000-000000000003','participant');
INSERT INTO organizations(id,organizer_id) VALUES('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
INSERT INTO events(id,organization_id) VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
INSERT INTO competition_contestants(id,event_id,name,entry_type,contestant_number) SELECT ('40000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'30000000-0000-0000-0000-000000000001','Entry '||i,CASE WHEN i=2 THEN 'group' ELSE 'individual' END,i FROM generate_series(1,7) i;
INSERT INTO competition_rounds(id,event_id,name,display_order,workflow,advancement_type,advancement_value) VALUES
('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Preliminary',0,'{"purpose":"qualification","progression":"back_to_zero"}','top_n',5),
('50000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Final',1,'{"purpose":"final","progression":"back_to_zero"}','none',NULL);
INSERT INTO competition_round_contestants(round_id,contestant_id) SELECT r.id,c.id FROM competition_rounds r CROSS JOIN competition_contestants c;
INSERT INTO competition_criteria(id,event_id,name,percentage,min_score,max_score) VALUES('60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Quality',100,0,100);
INSERT INTO competition_round_criteria(round_id,criteria_id) SELECT id,'60000000-0000-0000-0000-000000000001' FROM competition_rounds;
INSERT INTO event_participants(event_id,user_id) VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
