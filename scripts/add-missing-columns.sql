-- Bay Sentinel: Add missing columns referenced by the app
-- Run via Supabase SQL Editor or Management API
-- Safe to run multiple times (IF NOT EXISTS)

-- Columns needed by scoring engine (computeDistressScore + computeCompleteness)
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS completeness REAL DEFAULT 0;
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS upside_score INTEGER DEFAULT 0;
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS is_out_of_state BOOLEAN DEFAULT false;
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS years_owned INTEGER;
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS wildfire_risk TEXT;
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS flood_zone TEXT;

-- Columns needed by UI (lead detail owner/property tabs)
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS equity_percent REAL;
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS is_institutional BOOLEAN DEFAULT false;

-- Ensure scraped_at exists (defined in scraper schema but may be missing)
ALTER TABLE bs_leads ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;
