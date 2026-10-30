-- Explicit genders for the fictional demo fixtures only; real profiles are never inferred.
WITH demo_genders(id,gender) AS (VALUES
('seed-pgf','male'),('seed-pgm','female'),('seed-ifgf','male'),('seed-ifgm','female'),('seed-mgf','male'),('seed-mgm','female'),
('seed-dad','male'),('seed-wife1','female'),('seed-mum','female'),
('seed-c01','male'),('seed-c02','female'),('seed-c03','male'),('seed-c04','female'),('seed-c05','male'),('seed-c06','female'),('seed-c07','male'),('seed-c08','female'),('seed-c09','male'),('seed-c10','female'),('seed-c11','male'),('seed-c12','female'),
('seed-s01','female'),('seed-s02','male'),('seed-s03','female'),('seed-s04','male'),('seed-s05','female'),('seed-s06','male'),('seed-s07','female'),('seed-s08','male'),('seed-s09','female'),('seed-s10','male'),
('seed-g0101','male'),('seed-g0102','female'),('seed-g0201','female'),('seed-g0202','male'),('seed-g0301','female'),('seed-g0302','male'),('seed-g0401','male'),('seed-g0402','female'),('seed-g0501','male'),('seed-g0502','female'),('seed-g0601','female'),('seed-g0602','male'),('seed-g0701','male'),('seed-g0702','female'),('seed-g0801','male'),('seed-g0802','female'),('seed-g0901','male'),('seed-g0902','female'),('seed-g1001','male'),('seed-g1002','female')
)
UPDATE family_people SET gender=(SELECT gender FROM demo_genders WHERE demo_genders.id=family_people.id)
WHERE gender='unspecified' AND id IN (SELECT id FROM demo_genders);
