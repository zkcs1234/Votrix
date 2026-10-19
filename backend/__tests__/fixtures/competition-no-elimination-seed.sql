-- Seed prior to 097 to establish an existing, independently saved Final roster.
INSERT INTO events(id,organization_id) VALUES('31000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
INSERT INTO competition_contestants(id,event_id,name,contestant_number,entry_type) VALUES
('41000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','Alice',1,'individual'),
('41000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','Rhythm Crew',2,'group'),
('41000000-0000-0000-0000-000000000003','31000000-0000-0000-0000-000000000001','Registered only',3,'duo');
INSERT INTO competition_rounds(id,event_id,name,display_order,weight,workflow,advancement_type) VALUES
('51000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','Preliminary',0,30,'{"purpose":"regular","progression":"weighted"}','none'),
('51000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000001','Final',1,70,'{"purpose":"final","progression":"weighted"}','none'),
('51000000-0000-0000-0000-000000000003','31000000-0000-0000-0000-000000000001','Special Award',2,0,'{"purpose":"special","progression":"back_to_zero"}','none');
INSERT INTO competition_round_contestants(round_id,contestant_id) VALUES
('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001'),
('51000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002'),
('51000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000003');
UPDATE competition_rounds SET workflow=workflow||'{"purpose":"qualification"}' WHERE id='51000000-0000-0000-0000-000000000001';
INSERT INTO competition_criteria(id,event_id,name,percentage,min_score,max_score) VALUES('61000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001','Quality',100,0,100);
INSERT INTO competition_round_criteria(round_id,criteria_id) SELECT id,'61000000-0000-0000-0000-000000000001' FROM competition_rounds WHERE event_id='31000000-0000-0000-0000-000000000001';
INSERT INTO event_participants(event_id,user_id) VALUES('31000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
