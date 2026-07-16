export interface EventRecord {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  category: "ai" | "dev" | "crypto" | "tech";
  published_at: number;
  fetched_at: number;
  score: number;
  cross_sources: number;
  created_at: number;
}

export interface Environment {
  RSS_DB: D1Database;
  DEDUP?: KVNamespace;
  HOT_EVENTS?: KVNamespace;
  FEED_CACHE?: KVNamespace;
  DEFAULT_FEED_TTL_SECONDS: string;
  HOT_EVENT_TTL_SECONDS: string;
  DUPLICATE_TTL_SECONDS: string;
}

const FEEDS = [
  {
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss/",
    source: "OpenAI",
    category: "ai",
  },
  {
    name: "Google AI Blog",
    url: "https://ai.googleblog.com/feeds/posts/default?alt=rss",
    source: "Google",
    category: "ai",
  },
  {
    name: "arXiv AI",
    url: "https://export.arxiv.org/rss/cs.AI",
    source: "arXiv",
    category: "ai",
  },
  {
    name: "Hacker News",
    url: "https://news.ycombinator.com/rss",
    source: "HN",
    category: "tech",
  },
  {
    name: "Dev.to",
    url: "https://dev.to/feed",
    source: "Dev.to",
    category: "dev",
  },
  {
    name: "Reddit Machine Learning",
    url: "https://www.reddit.com/r/MachineLearning/.rss",
    source: "Reddit",
    category: "ai",
  },
];

const sourceScores: Record<string, number> = {
  openai: 10,
  google: 10,
  nvidia: 10,
  github: 9,
  hn: 9,
  arxiv: 8,
  reddit: 6,
  "dev.to": 5,
};

const topicBoost: Record<string, number> = {
  ai: 8,
  dev: 6,
  crypto: 4,
  tech: 0,
};

const HOT_SCORE_THRESHOLD = 75;
const RSS_SCORE_THRESHOLD = 70;

function normalizeSource(source: string) {
  return source.trim().toLowerCase();
}

function scoreSource(source: string) {
  return sourceScores[normalizeSource(source)] ?? 0;
}

function scoreFreshness(publishedAt: number) {
  const ageSeconds = Math.max(0, Date.now() / 1000 - publishedAt);
  if (ageSeconds < 3600) return 10;
  if (ageSeconds < 21600) return 7;
  if (ageSeconds < 86400) return 4;
  return 0;
}

function scoreCrossSources(count: number) {
  if (count >= 5) return 12;
  if (count >= 3) return 8;
  if (count >= 2) return 4;
  return 0;
}

function scoreTopic(category: string) {
  return topicBoost[category] ?? 0;
}

function calculateScore(event: EventRecord) {
  const sourceScore = scoreSource(event.source);
  const freshnessScore = scoreFreshness(event.published_at);
  const topicScore = scoreTopic(event.category);
  const crossSourceScore = scoreCrossSources(event.cross_sources);
  const total = sourceScore + freshnessScore + topicScore + crossSourceScore;
  return Math.max(0, Math.min(100, total));
}

function shouldPublish(score: number) {
  return score >= HOT_SCORE_THRESHOLD;
}

function shouldIncludeInRss(score: number) {
  return score >= RSS_SCORE_THRESHOLD;
}

function parseRssXml(xml: string) {
  const items: Partial<EventRecord>[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title>([^<]*)<\/title>/);
    const descriptionMatch = itemContent.match(/<description>([^<]*)<\/description>/);
    const linkMatch = itemContent.match(/<link>([^<]*)<\/link>/);
    const pubDateMatch = itemContent.match(/<pubDate>([^<]*)<\/pubDate>/);
    const guidMatch = itemContent.match(/<guid>([^<]*)<\/guid>/);

    const title = titleMatch ? titleMatch[1].trim() : "";
    const description = descriptionMatch ? descriptionMatch[1].trim() : "";
    const link = linkMatch ? linkMatch[1].trim() : "";
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
    const guid = guidMatch ? guidMatch[1].trim() : link;

    const publishedAt = pubDate ? Math.round(new Date(pubDate).getTime() / 1000) : Math.round(Date.now() / 1000);

    items.push({
      id: guid || `${link}:${title}`,
      title,
      description,
      url: link,
      published_at: publishedAt,
      source: "",
      category: "tech",
      fetched_at: Math.round(Date.now() / 1000),
      score: 0,
      cross_sources: 1,
      created_at: Math.round(Date.now() / 1000),
    });
  }

  return items;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildRss(events: EventRecord[], category?: string) {
  const title = category ? `AI News Intelligence: ${category}` : "AI News Intelligence";
  const description = category
    ? `Hot ${category} news from curated RSS sources.`
    : "Hot AI and tech news from curated RSS sources.";

  const items = events.map((event) => `
    <item>
      <title>${escapeHtml(event.title)}</title>
      <link>${escapeHtml(event.url)}</link>
      <description>${escapeHtml(event.description)}</description>
      <pubDate>${new Date(event.published_at * 1000).toUTCString()}</pubDate>
      <guid>${escapeHtml(event.id)}</guid>
    </item>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(title)}</title>
    <link>https://example.com/rss</link>
    <description>${escapeHtml(description)}</description>
    ${items.join("\n")}
  </channel>
</rss>`;
}

function createEventId(url: string, title: string) {
  return `${url}::${title}`;
}

async function saveEvent(env: Environment, event: EventRecord) {
  await env.RSS_DB.prepare(
    `INSERT OR REPLACE INTO events (id, title, description, url, source, category, published_at, fetched_at, score, cross_sources, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      event.id,
      event.title,
      event.description,
      event.url,
      event.source,
      event.category,
      event.published_at,
      event.fetched_at,
      event.score,
      event.cross_sources,
      event.created_at
    )
    .run();
}

async function cacheHotEvent(env: Environment, event: EventRecord) {
  if (!env.HOT_EVENTS) return;
  const ttl = Number(env.HOT_EVENT_TTL_SECONDS) || 300;
  await env.HOT_EVENTS.put(`event:hot:${event.id}`, JSON.stringify(event), { expirationTtl: ttl });
}

async function getCachedFeed(env: Environment, key: string) {
  return env.FEED_CACHE ? env.FEED_CACHE.get(key) : null;
}

async function cacheFeed(env: Environment, key: string, content: string, ttlSeconds: number) {
  if (!env.FEED_CACHE) return;
  await env.FEED_CACHE.put(key, content, { expirationTtl: ttlSeconds });
}

async function isDuplicate(env: Environment, id: string) {
  const row = await env.RSS_DB.prepare("SELECT 1 FROM events WHERE id = ? LIMIT 1").bind(id).first();
  return row !== null;
}

async function markDuplicate(env: Environment, id: string) {
  // No-op: deduplication now relies on D1, which is cheaper and persistent for this workload.
  return;
}

async function runFetchPipeline(env: Environment) {
  const collected: EventRecord[] = [];

  for (const feed of FEEDS) {
    try {
      const response = await fetch(feed.url, {
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      });
      if (!response.ok) continue;
      const xmlText = await response.text();
      const parsed = parseRssXml(xmlText);

      const events = parsed
        .filter((item): item is EventRecord => {
          return !!(item.title && item.url && item.description);
        })
        .map((item) => ({
          ...item,
          source: feed.source,
          category: feed.category,
          id: item.id || createEventId(item.url, item.title),
        }));

      collected.push(...events);
    } catch (error) {
      console.error(`Failed to fetch ${feed.url}`, error);
    }
  }

  const grouped = collected.reduce((map, event) => {
    const key = event.id;
    const existing = map[key];
    if (!existing) {
      map[key] = event;
      return map;
    }

    const crossSources = existing.cross_sources + 1;
    if (event.published_at > existing.published_at) {
      map[key] = { ...event, cross_sources: crossSources };
    } else {
      existing.cross_sources = crossSources;
    }
    return map;
  }, {} as Record<string, EventRecord>);

  const deduped = Object.values(grouped).map((event) => ({
    ...event,
    score: calculateScore(event),
  }));

  const saved: EventRecord[] = [];
  for (const event of deduped) {
    if (await isDuplicate(env, event.id)) continue;
    await saveEvent(env, event);
    if (shouldPublish(event.score)) {
      await cacheHotEvent(env, event);
    }
    saved.push(event);
  }

  return saved;
}

function parseQueryInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function queryEvents(env: Environment, category?: string, minScore = 0, limit = 50) {
  const params: string[] = [];
  let sql = "SELECT * FROM events";

  if (category) {
    params.push(category);
    sql += " WHERE category = ?";
  }

  if (minScore > 0) {
    sql += category ? " AND score >= ?" : " WHERE score >= ?";
    params.push(minScore.toString());
  }

  sql += " ORDER BY score DESC, published_at DESC LIMIT ?";
  params.push(limit.toString());

  const result = await env.RSS_DB.prepare(sql).bind(...params).all<EventRecord>();
  return result.results ?? [];
}

async function handleEventsRequest(request: Request, env: Environment) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;
  const minScore = parseQueryInt(url.searchParams.get("min_score"), 0);
  const limit = parseQueryInt(url.searchParams.get("limit"), 50);
  const events = await queryEvents(env, category, minScore, limit);
  return new Response(JSON.stringify({ data: events }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRssRequest(request: Request, env: Environment) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? undefined;
  const minScore = parseQueryInt(url.searchParams.get("min_score"), RSS_SCORE_THRESHOLD);
  const feedKey = `feed:${category ?? "all"}:min_score:${minScore}`;

  if (env.FEED_CACHE) {
    const cached = await getCachedFeed(env, feedKey);
    if (cached) {
      return new Response(cached, { headers: { "Content-Type": "application/rss+xml" } });
    }
  }

  const events = await queryEvents(env, category, minScore, 50);
  const rss = buildRss(events, category);
  const ttl = Number(env.DEFAULT_FEED_TTL_SECONDS) || 1800;
  if (env.FEED_CACHE) {
    await cacheFeed(env, feedKey, rss, ttl);
  }

  return new Response(rss, { headers: { "Content-Type": "application/rss+xml" } });
}

async function handleRequest(request: Request, env: Environment) {
  const url = new URL(request.url);
  if (url.pathname === "/events") return handleEventsRequest(request, env);
  if (url.pathname === "/rss") return handleRssRequest(request, env);
  return new Response("Not found", { status: 404 });
}

export default {
  fetch: async (request: Request, env: Environment) => handleRequest(request, env),
  scheduled: async (controller: ScheduledController, env: Environment) => {
    await runFetchPipeline(env);
    controller.waitUntil(Promise.resolve());
  },
};
