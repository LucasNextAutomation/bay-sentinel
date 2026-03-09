-- ============================================================================
-- Bay Sentinel — Complete Database Schema & Seed Data
-- Target: Supabase PostgreSQL
-- Run:    Copy/paste into Supabase SQL Editor, or use psql
-- ============================================================================

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Users
CREATE TABLE IF NOT EXISTS bs_users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name    VARCHAR(100),
  email         VARCHAR(255),
  role          VARCHAR(50) DEFAULT 'viewer',
  is_admin_role BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Leads — core property records
CREATE TABLE IF NOT EXISTS bs_leads (
  id              SERIAL PRIMARY KEY,
  address         VARCHAR(500),
  city            VARCHAR(100),
  county          VARCHAR(100),
  zip_code        VARCHAR(20),
  apn             VARCHAR(50),
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  distress_score  INTEGER DEFAULT 0,
  upside_score    INTEGER DEFAULT 0,
  completeness    REAL DEFAULT 0,
  lead_priority   VARCHAR(20) DEFAULT 'low',
  property_type   VARCHAR(50),
  beds            INTEGER,
  baths           REAL,
  sqft_living     INTEGER,
  sqft_lot        INTEGER,
  year_built      INTEGER,
  zoning          VARCHAR(20),
  has_garage      BOOLEAN,
  assessed_value  NUMERIC(15, 2),
  estimated_value NUMERIC(15, 2),
  last_sale_date  DATE,
  last_sale_price NUMERIC(15, 2),
  wildfire_risk   VARCHAR(20),
  flood_zone      VARCHAR(20),
  owner_name      VARCHAR(200),
  owner_phone     VARCHAR(30),
  owner_email     VARCHAR(255),
  mailing_address VARCHAR(500),
  is_absentee     BOOLEAN DEFAULT false,
  is_out_of_state BOOLEAN DEFAULT false,
  is_institutional BOOLEAN DEFAULT false,
  years_owned     INTEGER,
  equity_percent  REAL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  source          VARCHAR(100),
  UNIQUE (apn, county)
);

-- Signals — distress / opportunity indicators attached to leads
CREATE TABLE IF NOT EXISTS bs_signals (
  id          SERIAL PRIMARY KEY,
  lead_id     INTEGER NOT NULL REFERENCES bs_leads(id) ON DELETE CASCADE,
  name        VARCHAR(200),
  signal_type VARCHAR(50) NOT NULL,
  weight      REAL DEFAULT 1.0,
  detected_at TIMESTAMPTZ DEFAULT now(),
  source      VARCHAR(100)
);

-- Enrichment logs — audit trail for data enrichment
CREATE TABLE IF NOT EXISTS bs_enrichment_logs (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER NOT NULL REFERENCES bs_leads(id) ON DELETE CASCADE,
  source          VARCHAR(100),
  status          VARCHAR(50),
  fields_enriched TEXT[],
  duration        REAL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Scrapers — source health & metadata
CREATE TABLE IF NOT EXISTS bs_scrapers (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  health          VARCHAR(30) DEFAULT 'healthy',
  tier            INTEGER DEFAULT 2,
  type            VARCHAR(50),
  county          VARCHAR(100),
  category        VARCHAR(50),
  active          BOOLEAN DEFAULT true,
  successes       INTEGER DEFAULT 0,
  failures        INTEGER DEFAULT 0,
  records_fetched INTEGER DEFAULT 0,
  last_run        TIMESTAMPTZ,
  config          JSONB DEFAULT '{}'::jsonb
);

-- Operations — pipeline execution history
CREATE TABLE IF NOT EXISTS bs_operations (
  id                SERIAL PRIMARY KEY,
  operation_key     VARCHAR(100) NOT NULL,
  label             VARCHAR(300),
  status            VARCHAR(50) DEFAULT 'pending',
  is_active         BOOLEAN DEFAULT false,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  triggered_by      VARCHAR(100),
  duration_seconds  REAL,
  leads_created     INTEGER DEFAULT 0,
  leads_updated     INTEGER DEFAULT 0,
  leads_enriched    INTEGER DEFAULT 0,
  leads_failed      INTEGER DEFAULT 0,
  params            JSONB DEFAULT '{}'::jsonb,
  steps             JSONB DEFAULT '[]'::jsonb
);

-- Import batches — CSV upload tracking
CREATE TABLE IF NOT EXISTS bs_import_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename         VARCHAR(500),
  status           VARCHAR(50) DEFAULT 'pending',
  total_rows       INTEGER DEFAULT 0,
  valid_rows       INTEGER DEFAULT 0,
  error_rows       INTEGER DEFAULT 0,
  duplicate_rows   INTEGER DEFAULT 0,
  imported_rows    INTEGER DEFAULT 0,
  unmapped_columns TEXT[],
  rows_data        JSONB,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- App configuration — key-value store
CREATE TABLE IF NOT EXISTS bs_app_config (
  key   VARCHAR(200) PRIMARY KEY,
  value TEXT
);

-- Notification events — system event log
CREATE TABLE IF NOT EXISTS bs_notification_events (
  id          SERIAL PRIMARY KEY,
  event_type  VARCHAR(100),
  data        JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_bs_leads_county         ON bs_leads (county);
CREATE INDEX IF NOT EXISTS idx_bs_leads_distress_score  ON bs_leads (distress_score);
CREATE INDEX IF NOT EXISTS idx_bs_leads_lead_priority   ON bs_leads (lead_priority);
CREATE INDEX IF NOT EXISTS idx_bs_signals_lead_id       ON bs_signals (lead_id);
CREATE INDEX IF NOT EXISTS idx_bs_signals_signal_type   ON bs_signals (signal_type);
CREATE INDEX IF NOT EXISTS idx_bs_operations_status     ON bs_operations (status);
CREATE INDEX IF NOT EXISTS idx_bs_operations_is_active  ON bs_operations (is_active);


-- ============================================================================
-- 3. SEED DATA
-- ============================================================================

-- --------------------------------------------------------------------------
-- 3a. Users
-- --------------------------------------------------------------------------
-- Note: password_hash values are bcrypt($2a$10) placeholders.
-- admin password: BaySentinel2026!
-- nelson password: SafariVentures!
-- The application seed script (or first-login flow) can re-hash if needed.

INSERT INTO bs_users (username, password_hash, first_name, email, role, is_admin_role) VALUES
  (
    'admin',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'Admin',
    'admin@baysentinel.com',
    'admin',
    true
  ),
  (
    'nelson',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    'Nelson',
    'nelson@baysentinel.com',
    'viewer',
    false
  )
ON CONFLICT (username) DO NOTHING;


-- --------------------------------------------------------------------------
-- 3b. App Config
-- --------------------------------------------------------------------------

INSERT INTO bs_app_config (key, value) VALUES
  ('google_maps_key', ''),
  ('default_county', 'Santa Clara'),
  ('distress_score_version', '1.0'),
  ('enrichment_daily_limit', '500'),
  ('scraper_interval_minutes', '60')
ON CONFLICT (key) DO NOTHING;


-- --------------------------------------------------------------------------
-- 3c. Scrapers (15 sources)
-- --------------------------------------------------------------------------

INSERT INTO bs_scrapers (name, health, tier, type, county, category, active, successes, failures, records_fetched, last_run, config) VALUES
  -- Santa Clara County
  (
    'Santa Clara County Assessor',
    'healthy', 1, 'api', 'Santa Clara', 'ingest', true,
    1247, 3, 28450,
    now() - interval '2 hours',
    '{"endpoint": "https://assessor.sccgov.org/api/v1", "rate_limit": 100, "batch_size": 500}'::jsonb
  ),
  (
    'Santa Clara County Recorder',
    'healthy', 1, 'scraper', 'Santa Clara', 'ingest', true,
    892, 7, 15230,
    now() - interval '4 hours',
    '{"base_url": "https://recorderonline.sccgov.org", "selectors": {"table": ".results-table"}, "throttle_ms": 2000}'::jsonb
  ),
  (
    'Santa Clara Tax Collector',
    'healthy', 2, 'scraper', 'Santa Clara', 'ingest', true,
    445, 2, 8920,
    now() - interval '6 hours',
    '{"base_url": "https://payments.sccgov.org/propertytax", "throttle_ms": 3000}'::jsonb
  ),

  -- San Mateo County
  (
    'San Mateo County Assessor',
    'healthy', 1, 'api', 'San Mateo', 'ingest', true,
    1180, 5, 24300,
    now() - interval '3 hours',
    '{"endpoint": "https://assessor.smcgov.org/api/v1", "rate_limit": 80, "batch_size": 400}'::jsonb
  ),
  (
    'San Mateo County Recorder',
    'degraded', 1, 'scraper', 'San Mateo', 'ingest', true,
    780, 15, 12100,
    now() - interval '1 hour',
    '{"base_url": "https://recorder.smcgov.org", "selectors": {"table": ".doc-results"}, "throttle_ms": 2500, "last_error": "HTTP 429 rate limited"}'::jsonb
  ),
  (
    'San Mateo Tax Collector',
    'healthy', 2, 'scraper', 'San Mateo', 'ingest', true,
    390, 1, 7200,
    now() - interval '8 hours',
    '{"base_url": "https://tax.smcgov.org", "throttle_ms": 3000}'::jsonb
  ),

  -- Alameda County
  (
    'Alameda County Assessor',
    'healthy', 1, 'api', 'Alameda', 'ingest', true,
    1350, 4, 31200,
    now() - interval '2 hours',
    '{"endpoint": "https://www.acgov.org/assessor/api/v1", "rate_limit": 120, "batch_size": 600}'::jsonb
  ),
  (
    'Alameda County Recorder',
    'healthy', 1, 'scraper', 'Alameda', 'ingest', true,
    920, 8, 16800,
    now() - interval '5 hours',
    '{"base_url": "https://recorder.acgov.org", "selectors": {"table": "#recording-results"}, "throttle_ms": 2000}'::jsonb
  ),
  (
    'Alameda Tax Collector',
    'healthy', 2, 'scraper', 'Alameda', 'ingest', true,
    410, 3, 8100,
    now() - interval '7 hours',
    '{"base_url": "https://tax.acgov.org", "throttle_ms": 3000}'::jsonb
  ),

  -- Multi-county / General
  (
    'Bay Area Auction Monitor',
    'healthy', 1, 'feed', 'All', 'ingest', true,
    2100, 12, 4500,
    now() - interval '30 minutes',
    '{"feed_url": "https://www.auction.com/api/bay-area", "format": "json", "poll_interval": 1800}'::jsonb
  ),
  (
    'USPS Vacancy Tracker',
    'healthy', 2, 'api', 'All', 'ingest', true,
    680, 0, 12300,
    now() - interval '12 hours',
    '{"endpoint": "https://iv.usps.com/api/v1/vacancy", "batch_size": 200}'::jsonb
  ),
  (
    'BatchData Property Enrichment',
    'healthy', 2, 'api', 'All', 'enrich', true,
    3200, 18, 45600,
    now() - interval '1 hour',
    '{"endpoint": "https://api.batchdata.com/api/v1/property", "api_key_env": "BATCHDATA_API_KEY", "rate_limit": 50}'::jsonb
  ),
  (
    'BatchData Skip-Tracing',
    'healthy', 2, 'api', 'All', 'owner', true,
    1800, 22, 9800,
    now() - interval '3 hours',
    '{"endpoint": "https://api.batchdata.com/api/v1/skip-trace", "api_key_env": "BATCHDATA_API_KEY", "rate_limit": 30}'::jsonb
  ),
  (
    'Absentee Detection Engine',
    'healthy', 1, 'api', 'All', 'owner', true,
    5400, 0, 52000,
    now() - interval '45 minutes',
    '{"method": "mailing_vs_property_diff", "confidence_threshold": 0.85}'::jsonb
  ),
  (
    'Google Sheets Sync',
    'healthy', 1, 'api', 'All', 'maintain', true,
    89, 1, 0,
    now() - interval '20 minutes',
    '{"spreadsheet_id_env": "GOOGLE_SHEETS_ID", "sheet_name": "Bay Sentinel Leads", "sync_direction": "push"}'::jsonb
  )
ON CONFLICT DO NOTHING;


-- --------------------------------------------------------------------------
-- 3d. Operations (5 recent operations with realistic step arrays)
-- --------------------------------------------------------------------------

INSERT INTO bs_operations (
  operation_key, label, status, is_active,
  started_at, completed_at, triggered_by, duration_seconds,
  leads_created, leads_updated, leads_enriched, leads_failed,
  params, steps
) VALUES
  -- 1. Scrape NOD Records — completed 2 hours ago
  (
    'scrape_nod',
    'Scrape NOD Records',
    'completed',
    false,
    now() - interval '2 hours 3 minutes',
    now() - interval '2 hours',
    'admin',
    180,
    23, 8, 15, 2,
    '{"counties": ["Santa Clara", "San Mateo", "Alameda"], "record_type": "NOD"}'::jsonb,
    '[
      {"name": "Initialize scraper", "status": "completed", "duration": 2, "detail": "Connected to 3 county recorder portals"},
      {"name": "Fetch Santa Clara NODs", "status": "completed", "duration": 45, "detail": "Retrieved 18 NOD filings from past 30 days"},
      {"name": "Fetch San Mateo NODs", "status": "completed", "duration": 38, "detail": "Retrieved 12 NOD filings from past 30 days"},
      {"name": "Fetch Alameda NODs", "status": "completed", "duration": 52, "detail": "Retrieved 21 NOD filings from past 30 days"},
      {"name": "Deduplicate & match", "status": "completed", "duration": 15, "detail": "Matched 8 existing leads, created 23 new leads, 2 parse failures"},
      {"name": "Compute scores", "status": "completed", "duration": 8, "detail": "Updated distress scores for 46 leads"},
      {"name": "Generate signals", "status": "completed", "duration": 12, "detail": "Created 15 NOD signals"},
      {"name": "Finalize", "status": "completed", "duration": 8, "detail": "Operation completed successfully"}
    ]'::jsonb
  ),

  -- 2. Scrape County Assessor Records — completed 5 hours ago
  (
    'scrape_assessor',
    'Scrape County Assessor Records',
    'completed',
    false,
    now() - interval '5 hours 7 minutes',
    now() - interval '5 hours',
    'admin',
    420,
    45, 12, 38, 0,
    '{"counties": ["Santa Clara", "San Mateo", "Alameda"], "record_type": "assessor"}'::jsonb,
    '[
      {"name": "Initialize API connections", "status": "completed", "duration": 3, "detail": "Authenticated with 3 county assessor APIs"},
      {"name": "Query Santa Clara Assessor", "status": "completed", "duration": 120, "detail": "Fetched 1,247 property records"},
      {"name": "Query San Mateo Assessor", "status": "completed", "duration": 95, "detail": "Fetched 892 property records"},
      {"name": "Query Alameda Assessor", "status": "completed", "duration": 110, "detail": "Fetched 1,105 property records"},
      {"name": "Parse & normalize", "status": "completed", "duration": 35, "detail": "Normalized 3,244 records into standard schema"},
      {"name": "Deduplicate against DB", "status": "completed", "duration": 22, "detail": "Found 12 updates to existing leads, 45 new leads"},
      {"name": "Upsert leads", "status": "completed", "duration": 18, "detail": "Inserted 45 new, updated 12 existing"},
      {"name": "Enrich batch", "status": "completed", "duration": 12, "detail": "Auto-enriched 38 leads with assessor data"},
      {"name": "Finalize", "status": "completed", "duration": 5, "detail": "All records processed successfully"}
    ]'::jsonb
  ),

  -- 3. Recompute Distress Scores — completed 6 hours ago
  (
    'compute_scores',
    'Recompute Distress Scores',
    'completed',
    false,
    now() - interval '6 hours 1 minute 35 seconds',
    now() - interval '6 hours',
    'admin',
    95,
    0, 487, 0, 0,
    '{"scope": "all", "version": "1.0"}'::jsonb,
    '[
      {"name": "Load all leads", "status": "completed", "duration": 8, "detail": "Loaded 487 leads with signals"},
      {"name": "Compute signal scores", "status": "completed", "duration": 25, "detail": "Evaluated 1,240 signals across 487 leads"},
      {"name": "Compute property fit", "status": "completed", "duration": 18, "detail": "Scored property characteristics for 487 leads"},
      {"name": "Compute owner indicators", "status": "completed", "duration": 12, "detail": "Scored owner data for 487 leads"},
      {"name": "Assign priorities", "status": "completed", "duration": 5, "detail": "Critical: 34, High: 128, Med: 201, Low: 124"},
      {"name": "Update database", "status": "completed", "duration": 22, "detail": "Batch-updated 487 lead scores"},
      {"name": "Finalize", "status": "completed", "duration": 5, "detail": "Score recomputation complete"}
    ]'::jsonb
  ),

  -- 4. Skip-Trace Owner Data — partial, yesterday
  (
    'enrich_owner',
    'Skip-Trace Owner Data',
    'partial',
    false,
    now() - interval '1 day 14 minutes 50 seconds',
    now() - interval '1 day',
    'admin',
    890,
    0, 0, 156, 12,
    '{"provider": "batchdata", "batch_size": 50, "target": "missing_owner_data"}'::jsonb,
    '[
      {"name": "Identify targets", "status": "completed", "duration": 12, "detail": "Found 168 leads missing owner contact info"},
      {"name": "Batch 1 (1-50)", "status": "completed", "duration": 180, "detail": "Enriched 48 leads, 2 not found"},
      {"name": "Batch 2 (51-100)", "status": "completed", "duration": 195, "detail": "Enriched 46 leads, 4 not found"},
      {"name": "Batch 3 (101-150)", "status": "completed", "duration": 210, "detail": "Enriched 42 leads, 3 API timeouts, 5 not found"},
      {"name": "Batch 4 (151-168)", "status": "partial", "duration": 160, "detail": "Enriched 20 leads, 1 API timeout. Rate limit hit — paused"},
      {"name": "Update lead records", "status": "completed", "duration": 85, "detail": "Updated owner_name, owner_phone, owner_email for 156 leads"},
      {"name": "Log enrichment", "status": "completed", "duration": 48, "detail": "Created 168 enrichment log entries"}
    ]'::jsonb
  ),

  -- 5. Sync to Google Sheets — completed, yesterday
  (
    'export_sheets',
    'Sync to Google Sheets',
    'completed',
    false,
    now() - interval '1 day 8 seconds',
    now() - interval '1 day',
    'admin',
    8,
    0, 0, 0, 0,
    '{"sheet_name": "Bay Sentinel Leads", "filter": "priority IN (critical, high)"}'::jsonb,
    '[
      {"name": "Query leads", "status": "completed", "duration": 2, "detail": "Selected 162 high-priority leads"},
      {"name": "Format for Sheets", "status": "completed", "duration": 1, "detail": "Prepared 162 rows with 24 columns"},
      {"name": "Push to Google Sheets", "status": "completed", "duration": 4, "detail": "Updated sheet \"Bay Sentinel Leads\" — 162 rows written"},
      {"name": "Finalize", "status": "completed", "duration": 1, "detail": "Sync completed successfully"}
    ]'::jsonb
  )
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 4. HELPER FUNCTION — auto-update updated_at on leads
-- ============================================================================

CREATE OR REPLACE FUNCTION update_bs_leads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bs_leads_updated_at ON bs_leads;
CREATE TRIGGER trg_bs_leads_updated_at
  BEFORE UPDATE ON bs_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_bs_leads_updated_at();


-- ============================================================================
-- Done. Run scripts/seed-leads.ts next to populate leads + signals.
-- ============================================================================
