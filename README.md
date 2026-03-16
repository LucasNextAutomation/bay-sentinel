# Bay Sentinel — Frontend (Next.js)

Property intelligence UI. Connects to Supabase and optionally to the **Python scraper worker** (Railway).

## Connect to Python worker (Railway)

In `.env.local` (or your deployment env), set:

```bash
SCRAPER_WORKER_URL=https://bay-sentinel-scrapers-production.up.railway.app
```

Then in the UI (**Trigger Center** → Operations), you’ll see:

- **Run all scrapers** — triggers the 9 county scrapers + GIS (fire-and-forget).
- **Scrape Santa Clara / San Mateo / Alameda** — run assessor + recorder + tax scrapers per county.
- **Full Enrichment / Vacancy Only / Skip-Trace Only** — run vacancy detection + BatchData skip-trace flows.
- **Generate Daily Excel** — builds the daily Excel export.

If `SCRAPER_WORKER_URL` is not set, those actions are hidden from the list (or will error if called). Health check reports worker status at `/api/v1/health`.

### Manual integration checks

You can trigger the real worker directly through the Next.js API (same paths used by the Trigger Center):

```bash
# Run all 9 scrapers + GIS on the worker
curl -X POST "https://your-next-app.com/api/v1/enrichment/run/" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"operation":"worker_scrape"}'

# Scrape a single county (assessor + recorder + tax)
curl -X POST "https://your-next-app.com/api/v1/enrichment/run/" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"operation":"scrape_san_mateo"}'

# Full enrichment (vacancy + skip-trace, all contracted counties)
curl -X POST "https://your-next-app.com/api/v1/enrichment/run/" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"operation":"worker_enrichment"}'
```

Each call creates a row in `bs_operations` and the response includes
`leads_created`, `leads_updated`, and `leads_enriched` so you can
quickly confirm that the worker and UI metrics stay in sync.
