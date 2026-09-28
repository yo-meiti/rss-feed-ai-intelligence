# RSS Feed AI Intelligence

A Cloudflare Workers project that aggregates technical and AI news from multiple RSS feeds, normalizes the items, removes duplicates, scores each event by relevance, stores the results in D1, and exposes both JSON and RSS outputs.

## Overview

This project is designed to collect, rank, and serve important AI and tech news from multiple sources in a deterministic and explainable way.

The pipeline is:

RSS feeds → parse → normalize → deduplicate → score → store in D1 → cache hot items in KV → expose API + RSS

The system does not depend on an LLM to decide what is important. Instead, it uses a transparent rule engine based on:

- source reliability
- freshness of publication
- topic relevance
- cross-source duplication

## Features

- Fetches RSS feeds from multiple technology and AI sources
- Parses and normalizes feed items
- Deduplicates repeated stories across sources
- Scores events based on explainable rules
- Stores news in Cloudflare D1
- Caches hot items in Cloudflare KV
- Serves filtered JSON endpoints
- Generates RSS output for subscriptions or downstream tools
- Runs on a cron schedule to refresh content automatically

## Architecture

```text
+------------------+
| RSS Sources      |
| OpenAI, Google   |
| arXiv, HN, Dev   |
| GitHub, Reddit   |
+---------+--------+
          |
          v
+------------------+
| Cloudflare Worker|
| fetch + parse    |
| normalize + dedup|
+---------+--------+
          |
          v
+------------------+
| Rule Engine      |
| Score each event |
+---------+--------+
          |
          v
+------------------+
| D1 Database      |
| stores events    |
+---------+--------+
          |
          v
+------------------+
| KV Cache         |
| hot events       |
| RSS feed cache   |
+---------+--------+
          |
          v
+------------------+
| API + RSS output |
| /events, /rss    |
+------------------+
```

## Supported sources

The project currently reads feeds from:

- OpenAI Blog
- Google AI Blog
- arXiv AI
- Hacker News
- Dev.to
- GitHub Blog
- Stack Overflow Blog
- AWS News Blog
- Hugging Face Blog
- Reddit Machine Learning

## Project structure

```text
rss-feed/
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
├── wrangler.toml
├── src/
│   ├── index.ts
│   ├── schema.sql
│   └── index.js   # local duplicate for reference, kept only if needed
├── README.md
└── .wrangler/      # generated local runtime state, not committed
```

## Scoring logic

Each event receives a score from 0 to 100 using a rule-based formula.

Main factors:

- source signal strength
- freshness of the article
- category relevance such as AI or developer content
- cross-source duplication

Example scoring behavior:

- official source + recent publication + AI topic = higher priority
- repeated article across multiple sources = stronger signal
- older content with weaker source = lower priority

A score above 75 is treated as a hot event for caching and prioritization.

## API endpoints

After deployment, the Worker exposes these endpoints:

- `GET /events?category=ai&min_score=70&limit=50`
- `GET /rss?category=ai&min_score=70`
- `GET /run` for a manual fetch trigger

## Local development

### Prerequisites

- Node.js 18+
- npm
- Cloudflare account
- Wrangler CLI

### Install dependencies

```bash
npm install
```

### Start local development

```bash
npm run dev
```

The Wrangler CLI will print the local Worker URL for development.

## Cloudflare setup

### 1) Log in to Cloudflare

```bash
npx wrangler login
```

To verify authentication:

```bash
npx wrangler whoami
```

### 2) Create a D1 database

```bash
npx wrangler d1 create rss_feed_db
```

Copy the returned database ID into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "RSS_DB"
database_name = "rss_feed_db"
database_id = "PASTE_YOUR_D1_DATABASE_ID"
```

### 3) Create KV namespaces

```bash
npx wrangler kv:namespace create "HOT_EVENTS"
npx wrangler kv:namespace create "FEED_CACHE"
```

Then paste the generated IDs into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "HOT_EVENTS"
id = "PASTE_YOUR_HOT_EVENTS_KV_NAMESPACE_ID"

[[kv_namespaces]]
binding = "FEED_CACHE"
id = "PASTE_YOUR_FEED_CACHE_KV_NAMESPACE_ID"
```

### 4) Initialize the database schema

```bash
npx wrangler d1 execute rss_feed_db --file=./src/schema.sql
```

### 5) Configure the worker

Make sure `wrangler.toml` contains your actual Cloudflare resource IDs before deployment.

### 6) Build the project

```bash
npm run build
```

### 7) Deploy to Cloudflare

```bash
npx wrangler deploy
```

The worker is scheduled to run every 30 minutes through the configured cron:

```toml
[triggers]
crons = ["0,30 * * * *"]
```

## Useful commands

```bash
npm install
npm run build
npm run dev
npx wrangler deploy
npx wrangler d1 list
npx wrangler kv namespace list
```

## Deployment notes

- Keep production resource IDs inside Cloudflare, not in source control.
- Never commit live secrets, tokens, or account IDs to GitHub.
- Use placeholders in `wrangler.toml` when preparing a public repository.
- Remove local generated folders like `.wrangler`, `dist`, and `node_modules` before publishing.

## License

This project is intended for learning, experimentation, and personal use. If you plan to publish it publicly, add an appropriate license such as MIT before release.

