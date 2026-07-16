# RSS Feed AI Intelligence

A Cloudflare Workers project that collects RSS news, normalizes and scores events, saves them in D1, caches hot items in KV, and exposes a search API and RSS output.

## Architecture

- Cron-driven RSS fetcher
- XML parsing and normalization
- Deduplication using KV
- Rule-based scoring engine
- D1 event storage
- KV caching for hot items and RSS feeds
- API and RSS endpoints

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create D1 database:
   ```bash
   npx wrangler d1 create rss_feed_db
   ```

3. Create KV namespaces:
   ```bash
   npx wrangler kv:namespace create "DEDUP"
   npx wrangler kv:namespace create "HOT_EVENTS"
   npx wrangler kv:namespace create "FEED_CACHE"
   ```

4. Copy the generated namespace IDs into `wrangler.toml`.

5. Initialize the D1 schema using the SQL file:
   ```bash
   npx wrangler d1 execute --database rss_feed_db src/schema.sql
   ```

6. Run local development:
   ```bash
   npm run dev
   ```

## Endpoints

- `GET /events?category=ai&min_score=70&limit=50`
- `GET /rss?category=ai&min_score=70`

## Notes

- RSS feeds are cached for 30 minutes.
- Hot events are cached for 5 minutes.
- The scoring engine is deterministic and explainable.
