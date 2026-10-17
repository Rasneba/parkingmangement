-- Subscription QR card storage (legacy routes write qr_code/qr_image on create/renew)
ALTER TABLE parking_subscriptions
  ADD COLUMN IF NOT EXISTS qr_code TEXT,
  ADD COLUMN IF NOT EXISTS qr_image TEXT;
