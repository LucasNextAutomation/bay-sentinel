# Bay Sentinel — Frontend (Next.js)

Property intelligence UI. Connects to Supabase and optionally to the **Python scraper worker** (Railway).

## Connect to Python worker (Railway)

In `.env.local` (or your deployment env), set:

```bash
SCRAPER_WORKER_URL=https://bay-sentinel-scrapers-production.up.railway.app
```

Then in the UI (**Trigger Center** → Operations), you’ll see:

- **Backend: Run all scrapers** — triggers the 9 county scrapers + GIS (fire-and-forget).
- **Backend: Vacancy + Skip-trace** — runs vacancy detection and BatchData skip-trace.
- **Backend: Generate daily Excel** — builds the daily Excel export.

If `SCRAPER_WORKER_URL` is not set, those three actions are hidden from the list (or will error if called). Health check reports worker status at `/api/v1/health`.
