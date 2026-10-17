ALTER TABLE parking_subscriptions
  DROP COLUMN IF EXISTS qr_code,
  DROP COLUMN IF EXISTS qr_image;
