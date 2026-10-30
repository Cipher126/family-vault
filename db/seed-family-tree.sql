PRAGMA foreign_keys = ON;

-- Repeatable local demo family. Existing relatives are preserved.
WITH admin(id) AS (
  SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1
), seed_people(id,first_name,last_name,nickname,birth_date,death_date,biography) AS (VALUES
  ('seed-pgf','Adebayo','Fabiyi','Baba','1932-02-14','2010-07-03','A patient farmer and the root of the Fabiyi branch.'),
  ('seed-pgm','Funmilayo','Fabiyi','Iya','1938-09-21',NULL,'Known for her stories, songs, and generous Sunday table.'),
  ('seed-ifgf','Chukwuemeka','Okafor','Papa','1934-05-08','2015-11-19','A respected teacher who believed every child deserved an education.'),
  ('seed-ifgm','Ngozi','Okafor','Mama N','1940-01-27',NULL,'The warm centre of the Okafor household.'),
  ('seed-mgf','Emmanuel','Adeyemi','Grandpa','1936-12-04','2018-03-16','A thoughtful craftsman with a quiet sense of humour.'),
  ('seed-mgm','Grace','Adeyemi','Grandma G','1942-07-11',NULL,'A joyful gardener and keeper of family traditions.'),
  ('seed-dad','Tunde','Fabiyi','Dad','1960-06-18',NULL,'Father of twelve. He built a large blended family around patience and responsibility.'),
  ('seed-wife1','Ifeoma','Fabiyi','Aunty Ify','1963-03-09','2004-08-22','Tunde''s first wife and mother of ten children. Remembered for her strength and kindness.'),
  ('seed-mum','Bose','Fabiyi','Mum','1970-10-12',NULL,'Tunde''s second wife and mother of Pelumi and Temi.'),
  ('seed-c01','Chinedu','Fabiyi','Nedu','1982-01-14',NULL,'The eldest sibling and a steady hand in the family.'),
  ('seed-c02','Amaka','Fabiyi','Amy','1983-04-25',NULL,'Organiser of reunions and collector of old photographs.'),
  ('seed-c03','Obinna','Fabiyi','Obi','1985-08-03',NULL,'A lively storyteller who keeps everyone laughing.'),
  ('seed-c04','Adaeze','Fabiyi','Ada','1987-02-19',NULL,'A caring older sister and devoted mother.'),
  ('seed-c05','Kelechi','Fabiyi','KC','1988-11-07',NULL,'The family problem-solver.'),
  ('seed-c06','Nkiru','Fabiyi','NK','1990-06-15',NULL,'Loves music, travel, and family celebrations.'),
  ('seed-c07','Emeka','Fabiyi','Meka','1992-09-29',NULL,'Always ready with practical help.'),
  ('seed-c08','Chiamaka','Fabiyi','Chi','1994-12-10',NULL,'Keeps the younger cousins connected.'),
  ('seed-c09','Ikenna','Fabiyi','Ike','1996-05-01',NULL,'A curious builder and proud father.'),
  ('seed-c10','Oluchi','Fabiyi','Luchi','1998-07-23',NULL,'Brings warmth and energy to every gathering.'),
  ('seed-c11','Pelumi','Fabiyi','Pelu','2001-03-17',NULL,'Building the family vault so every branch can preserve its story.'),
  ('seed-c12','Temiloluwa','Fabiyi','Temi','2004-10-05',NULL,'The youngest of the twelve siblings.'),
  ('seed-s01','Adanna','Fabiyi','Ada','1985-02-02',NULL,'Chinedu''s partner.'),
  ('seed-s02','Kunle','Akinola','Kay','1982-09-13',NULL,'Amaka''s partner.'),
  ('seed-s03','Zainab','Fabiyi','Zee','1988-04-21',NULL,'Obinna''s partner.'),
  ('seed-s04','Femi','Ogunleye','Fem','1985-12-28',NULL,'Adaeze''s partner.'),
  ('seed-s05','Ejiro','Fabiyi','EJ','1990-08-09',NULL,'Kelechi''s partner.'),
  ('seed-s06','Tosin','Balogun','Tee','1989-01-30',NULL,'Nkiru''s partner.'),
  ('seed-s07','Sade','Fabiyi','Shady','1994-06-06',NULL,'Emeka''s partner.'),
  ('seed-s08','Uche','Nwosu','UC','1992-03-15',NULL,'Chiamaka''s partner.'),
  ('seed-s09','Mariam','Fabiyi','Mimi','1997-11-11',NULL,'Ikenna''s partner.'),
  ('seed-s10','Dayo','Ajayi','D','1996-05-26',NULL,'Oluchi''s partner.'),
  ('seed-g0101','Somto','Fabiyi','Som','2008-02-11',NULL,'Child of Chinedu and Adanna.'),
  ('seed-g0102','Kamsi','Fabiyi','Kam','2011-09-04',NULL,'Child of Chinedu and Adanna.'),
  ('seed-g0201','Tara','Akinola','T','2009-07-19',NULL,'Child of Amaka and Kunle.'),
  ('seed-g0202','Tobi','Akinola','Tobs','2013-01-22',NULL,'Child of Amaka and Kunle.'),
  ('seed-g0301','Amina','Fabiyi','Mina','2012-06-30',NULL,'Child of Obinna and Zainab.'),
  ('seed-g0302','Yusuf','Fabiyi','Yus','2015-10-14',NULL,'Child of Obinna and Zainab.'),
  ('seed-g0401','David','Ogunleye','Dave','2010-03-08',NULL,'Child of Adaeze and Femi.'),
  ('seed-g0402','Deborah','Ogunleye','Debbie','2014-12-17',NULL,'Child of Adaeze and Femi.'),
  ('seed-g0501','Chisom','Fabiyi','Chiso','2016-05-03',NULL,'Child of Kelechi and Ejiro.'),
  ('seed-g0502','Chidera','Fabiyi','Dera','2019-08-25',NULL,'Child of Kelechi and Ejiro.'),
  ('seed-g0601','Morenike','Balogun','Reni','2014-04-09',NULL,'Child of Nkiru and Tosin.'),
  ('seed-g0602','Ayomide','Balogun','Ayo','2018-11-20',NULL,'Child of Nkiru and Tosin.'),
  ('seed-g0701','Ifeanyi','Fabiyi','Ify','2017-01-16',NULL,'Child of Emeka and Sade.'),
  ('seed-g0702','Nneoma','Fabiyi','Nneo','2020-06-07',NULL,'Child of Emeka and Sade.'),
  ('seed-g0801','Kene','Nwosu','Ken','2018-02-28',NULL,'Child of Chiamaka and Uche.'),
  ('seed-g0802','Zara','Nwosu','Z','2021-09-12',NULL,'Child of Chiamaka and Uche.'),
  ('seed-g0901','Malik','Fabiyi','Mal','2020-03-05',NULL,'Child of Ikenna and Mariam.'),
  ('seed-g0902','Laila','Fabiyi','Lai','2023-05-18',NULL,'Child of Ikenna and Mariam.'),
  ('seed-g1001','Damilola','Ajayi','Dami','2019-10-02',NULL,'Child of Oluchi and Dayo.'),
  ('seed-g1002','Toluwani','Ajayi','Tolu','2022-12-29',NULL,'Child of Oluchi and Dayo.')
)
INSERT OR IGNORE INTO family_people(id,first_name,last_name,nickname,birth_date,death_date,biography,created_by)
SELECT seed_people.id,first_name,last_name,nickname,birth_date,death_date,biography,admin.id FROM seed_people CROSS JOIN admin;

WITH admin(id) AS (
  SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1
), seed_relationships(id,person_a_id,person_b_id,relationship) AS (VALUES
  ('seed-r-pgp','seed-pgf','seed-pgm','partner'),
  ('seed-r-ifgp','seed-ifgf','seed-ifgm','partner'),
  ('seed-r-mgp','seed-mgf','seed-mgm','partner'),
  ('seed-r-pgf-dad','seed-pgf','seed-dad','parent'),('seed-r-pgm-dad','seed-pgm','seed-dad','parent'),
  ('seed-r-ifgf-wife','seed-ifgf','seed-wife1','parent'),('seed-r-ifgm-wife','seed-ifgm','seed-wife1','parent'),
  ('seed-r-mgf-mum','seed-mgf','seed-mum','parent'),('seed-r-mgm-mum','seed-mgm','seed-mum','parent'),
  ('seed-r-dad-wife1','seed-dad','seed-wife1','partner'),('seed-r-dad-mum','seed-dad','seed-mum','partner'),
  ('seed-r-dad-c01','seed-dad','seed-c01','parent'),('seed-r-wife-c01','seed-wife1','seed-c01','parent'),
  ('seed-r-dad-c02','seed-dad','seed-c02','parent'),('seed-r-wife-c02','seed-wife1','seed-c02','parent'),
  ('seed-r-dad-c03','seed-dad','seed-c03','parent'),('seed-r-wife-c03','seed-wife1','seed-c03','parent'),
  ('seed-r-dad-c04','seed-dad','seed-c04','parent'),('seed-r-wife-c04','seed-wife1','seed-c04','parent'),
  ('seed-r-dad-c05','seed-dad','seed-c05','parent'),('seed-r-wife-c05','seed-wife1','seed-c05','parent'),
  ('seed-r-dad-c06','seed-dad','seed-c06','parent'),('seed-r-wife-c06','seed-wife1','seed-c06','parent'),
  ('seed-r-dad-c07','seed-dad','seed-c07','parent'),('seed-r-wife-c07','seed-wife1','seed-c07','parent'),
  ('seed-r-dad-c08','seed-dad','seed-c08','parent'),('seed-r-wife-c08','seed-wife1','seed-c08','parent'),
  ('seed-r-dad-c09','seed-dad','seed-c09','parent'),('seed-r-wife-c09','seed-wife1','seed-c09','parent'),
  ('seed-r-dad-c10','seed-dad','seed-c10','parent'),('seed-r-wife-c10','seed-wife1','seed-c10','parent'),
  ('seed-r-dad-c11','seed-dad','seed-c11','parent'),('seed-r-mum-c11','seed-mum','seed-c11','parent'),
  ('seed-r-dad-c12','seed-dad','seed-c12','parent'),('seed-r-mum-c12','seed-mum','seed-c12','parent'),
  ('seed-r-c01-s01','seed-c01','seed-s01','partner'),('seed-r-c02-s02','seed-c02','seed-s02','partner'),
  ('seed-r-c03-s03','seed-c03','seed-s03','partner'),('seed-r-c04-s04','seed-c04','seed-s04','partner'),
  ('seed-r-c05-s05','seed-c05','seed-s05','partner'),('seed-r-c06-s06','seed-c06','seed-s06','partner'),
  ('seed-r-c07-s07','seed-c07','seed-s07','partner'),('seed-r-c08-s08','seed-c08','seed-s08','partner'),
  ('seed-r-c09-s09','seed-c09','seed-s09','partner'),('seed-r-c10-s10','seed-c10','seed-s10','partner'),
  ('seed-r-c01-g0101','seed-c01','seed-g0101','parent'),('seed-r-s01-g0101','seed-s01','seed-g0101','parent'),
  ('seed-r-c01-g0102','seed-c01','seed-g0102','parent'),('seed-r-s01-g0102','seed-s01','seed-g0102','parent'),
  ('seed-r-c02-g0201','seed-c02','seed-g0201','parent'),('seed-r-s02-g0201','seed-s02','seed-g0201','parent'),
  ('seed-r-c02-g0202','seed-c02','seed-g0202','parent'),('seed-r-s02-g0202','seed-s02','seed-g0202','parent'),
  ('seed-r-c03-g0301','seed-c03','seed-g0301','parent'),('seed-r-s03-g0301','seed-s03','seed-g0301','parent'),
  ('seed-r-c03-g0302','seed-c03','seed-g0302','parent'),('seed-r-s03-g0302','seed-s03','seed-g0302','parent'),
  ('seed-r-c04-g0401','seed-c04','seed-g0401','parent'),('seed-r-s04-g0401','seed-s04','seed-g0401','parent'),
  ('seed-r-c04-g0402','seed-c04','seed-g0402','parent'),('seed-r-s04-g0402','seed-s04','seed-g0402','parent'),
  ('seed-r-c05-g0501','seed-c05','seed-g0501','parent'),('seed-r-s05-g0501','seed-s05','seed-g0501','parent'),
  ('seed-r-c05-g0502','seed-c05','seed-g0502','parent'),('seed-r-s05-g0502','seed-s05','seed-g0502','parent'),
  ('seed-r-c06-g0601','seed-c06','seed-g0601','parent'),('seed-r-s06-g0601','seed-s06','seed-g0601','parent'),
  ('seed-r-c06-g0602','seed-c06','seed-g0602','parent'),('seed-r-s06-g0602','seed-s06','seed-g0602','parent'),
  ('seed-r-c07-g0701','seed-c07','seed-g0701','parent'),('seed-r-s07-g0701','seed-s07','seed-g0701','parent'),
  ('seed-r-c07-g0702','seed-c07','seed-g0702','parent'),('seed-r-s07-g0702','seed-s07','seed-g0702','parent'),
  ('seed-r-c08-g0801','seed-c08','seed-g0801','parent'),('seed-r-s08-g0801','seed-s08','seed-g0801','parent'),
  ('seed-r-c08-g0802','seed-c08','seed-g0802','parent'),('seed-r-s08-g0802','seed-s08','seed-g0802','parent'),
  ('seed-r-c09-g0901','seed-c09','seed-g0901','parent'),('seed-r-s09-g0901','seed-s09','seed-g0901','parent'),
  ('seed-r-c09-g0902','seed-c09','seed-g0902','parent'),('seed-r-s09-g0902','seed-s09','seed-g0902','parent'),
  ('seed-r-c10-g1001','seed-c10','seed-g1001','parent'),('seed-r-s10-g1001','seed-s10','seed-g1001','parent'),
  ('seed-r-c10-g1002','seed-c10','seed-g1002','parent'),('seed-r-s10-g1002','seed-s10','seed-g1002','parent')
)
INSERT OR IGNORE INTO family_relationships(id,person_a_id,person_b_id,relationship,created_by)
SELECT seed_relationships.id,person_a_id,person_b_id,relationship,admin.id FROM seed_relationships CROSS JOIN admin;

WITH admin(id) AS (
  SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1
), portraits(person_id,photo_id) AS (VALUES
  ('seed-pgf','dev-unsplash-1529156069898-49953e39b3ac'),
  ('seed-pgm','dev-unsplash-1511895426328-dc8714191300'),
  ('seed-dad','dev-unsplash-1504151932400-72d4384f04b3'),
  ('seed-wife1','dev-unsplash-1529333166437-7750a6dd5a70'),
  ('seed-mum','dev-unsplash-1475503572774-15a45e5d60b9'),
  ('seed-c11','dev-unsplash-1485217988980-11786ced9454')
)
INSERT OR IGNORE INTO photo_people(photo_id,person_id,tagged_by)
SELECT portraits.photo_id,portraits.person_id,admin.id FROM portraits JOIN photos ON photos.id=portraits.photo_id CROSS JOIN admin;

UPDATE family_people SET profile_photo_id = (
  SELECT photo_id FROM photo_people WHERE photo_people.person_id = family_people.id ORDER BY created_at LIMIT 1
) WHERE id LIKE 'seed-%' AND EXISTS (SELECT 1 FROM photo_people WHERE photo_people.person_id = family_people.id);
