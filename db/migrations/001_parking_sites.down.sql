-- 001_parking_sites (DOWN)
ALTER TABLE parking_zones DROP COLUMN IF EXISTS site_id;
DROP TABLE IF EXISTS parking_sites;
