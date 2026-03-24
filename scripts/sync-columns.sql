-- Bay Sentinel: Sync data from old column names to new column names
-- Old columns (scrapers write to) → New columns (app reads from)
-- Only update where new column is NULL to avoid overwriting existing data
-- Run via Supabase SQL Editor

-- sqft → sqft_living
UPDATE bs_leads SET sqft_living = sqft WHERE sqft IS NOT NULL AND sqft_living IS NULL;

-- price_est → estimated_value
UPDATE bs_leads SET estimated_value = price_est WHERE price_est IS NOT NULL AND estimated_value IS NULL;

-- lot_sqft → sqft_lot
UPDATE bs_leads SET sqft_lot = lot_sqft WHERE lot_sqft IS NOT NULL AND sqft_lot IS NULL;

-- phone → owner_phone
UPDATE bs_leads SET owner_phone = phone WHERE phone IS NOT NULL AND owner_phone IS NULL;

-- email → owner_email
UPDATE bs_leads SET owner_email = email WHERE email IS NOT NULL AND owner_email IS NULL;

-- owner_address → mailing_address
UPDATE bs_leads SET mailing_address = owner_address WHERE owner_address IS NOT NULL AND mailing_address IS NULL;

-- absentee → is_absentee
UPDATE bs_leads SET is_absentee = absentee WHERE absentee IS NOT NULL AND is_absentee IS DISTINCT FROM absentee;

-- mls_listed → is_mls_listed
UPDATE bs_leads SET is_mls_listed = mls_listed WHERE mls_listed IS NOT NULL AND is_mls_listed IS DISTINCT FROM mls_listed;

-- garage → has_garage
UPDATE bs_leads SET has_garage = garage WHERE garage IS NOT NULL AND has_garage IS DISTINCT FROM garage;

-- score → distress_score (only where distress_score hasn't been computed)
UPDATE bs_leads SET distress_score = score WHERE score IS NOT NULL AND score > 0 AND (distress_score IS NULL OR distress_score = 0);

-- Sync signal names from signal_type
UPDATE bs_signals SET name = signal_type WHERE name IS NULL AND signal_type IS NOT NULL;
