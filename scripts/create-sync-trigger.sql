-- Bay Sentinel: Auto-sync trigger for old→new column names
-- Runs on every INSERT/UPDATE to bs_leads
-- Ensures scrapers writing to old columns automatically populate new columns

CREATE OR REPLACE FUNCTION sync_lead_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sqft IS NOT NULL AND NEW.sqft_living IS NULL THEN
    NEW.sqft_living := NEW.sqft;
  END IF;
  IF NEW.price_est IS NOT NULL AND NEW.estimated_value IS NULL THEN
    NEW.estimated_value := NEW.price_est;
  END IF;
  IF NEW.lot_sqft IS NOT NULL AND NEW.sqft_lot IS NULL THEN
    NEW.sqft_lot := NEW.lot_sqft;
  END IF;
  IF NEW.phone IS NOT NULL AND NEW.owner_phone IS NULL THEN
    NEW.owner_phone := NEW.phone;
  END IF;
  IF NEW.email IS NOT NULL AND NEW.owner_email IS NULL THEN
    NEW.owner_email := NEW.email;
  END IF;
  IF NEW.owner_address IS NOT NULL AND NEW.mailing_address IS NULL THEN
    NEW.mailing_address := NEW.owner_address;
  END IF;
  IF NEW.absentee IS NOT NULL AND NEW.is_absentee IS DISTINCT FROM NEW.absentee THEN
    NEW.is_absentee := NEW.absentee;
  END IF;
  IF NEW.mls_listed IS NOT NULL AND NEW.is_mls_listed IS DISTINCT FROM NEW.mls_listed THEN
    NEW.is_mls_listed := NEW.mls_listed;
  END IF;
  IF NEW.garage IS NOT NULL AND NEW.has_garage IS DISTINCT FROM NEW.garage THEN
    NEW.has_garage := NEW.garage;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_lead_columns ON bs_leads;
CREATE TRIGGER trg_sync_lead_columns
  BEFORE INSERT OR UPDATE ON bs_leads
  FOR EACH ROW
  EXECUTE FUNCTION sync_lead_columns();
