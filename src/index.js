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
    name: "GitHub Blog",
    url: "https://github.blog/feed/",
    source: "GitHub",
    category: "dev",
  },
  {
    name: "Stack Overflow Blog",
    url: "https://stackoverflow.blog/feed/",
    source: "Stack Overflow",
    category: "dev",
  },
  {
    name: "AWS News Blog",
    url: "https://aws.amazon.com/blogs/aws/feed/",
    source: "AWS",
    category: "dev",
  },
  {
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    source: "Hugging Face",
    category: "ai",
  },
  {
    name: "Reddit Machine Learning",
    url: "https://www.reddit.com/r/MachineLearning/.rss",
    source: "Reddit",
    category: "ai",
  },
];

const sourceScores = {
  openai: 10,
  google: 10,
  nvidia: 10,
  github: 9,
  hn: 9,
  arxiv: 8,
  reddit: 6,
  "dev.to": 5,
  aws: 7,
  "stack overflow": 7,
  "hugging face": 6,
};

const topicBoost = {
  ai: 8,
  dev: 6,
  crypto: 4,
  tech: 0,
};

const HOT_SCORE_THRESHOLD = 75;
const RSS_SCORE_THRESHOLD = 70;

function normalizeSource(source) {
  return source.trim().toLowerCase();
}

function scoreSource(source) {
  return sourceScores[normalizeSource(source)] ?? 0;
}

function scoreFreshness(publishedAt) {
  const ageSeconds = Math.max(0, Date.now() / 1000 - publishedAt);
  if (ageSeconds < 3600) return 10;
  if (ageSeconds < 21600) return 7;
  if (ageSeconds < 86400) return 4;
  return 0;
}

function scoreCrossSources(count) {
  if (count >= 5) return 12;
  if (count >= 3) return 8;
  if (count >= 2) return 4;
  return 0;
}

function scoreTopic(category) {
  return topicBoost[category] ?? 0;
}

function calculateScore(event) {
  const sourceScore = scoreSource(event.source);
  const freshnessScore = scoreFreshness(event.published_at);
  const topicScore = scoreTopic(event.category);
  const crossSourceScore = scoreCrossSources(event.cross_sources);
  const total = sourceScore + freshnessScore + topicScore + crossSourceScore;
  return Math.max(0, Math.min(100, total));
}

function shouldPublish(score) {
  return score >= HOT_SCORE_THRESHOLD;
}

function shouldIncludeInRss(score) {
  return score >= RSS_SCORE_THRESHOLD;
}

function decodeXmlValue(value) {
  if (!value) return "";
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseRssXml(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemContent = match[1];
    const titleMatch = itemContent.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descriptionMatch = itemContent.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const linkMatch = itemContent.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    const pubDateMatch = itemContent.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const guidMatch = itemContent.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);

    const title = decodeXmlValue(titleMatch ? titleMatch[1] : "");
    const description = decodeXmlValue(descriptionMatch ? descriptionMatch[1] : "");
    const link = decodeXmlValue(linkMatch ? linkMatch[1] : "");
    const pubDate = decodeXmlValue(pubDateMatch ? pubDateMatch[1] : "");
    const guid = decodeXmlValue(guidMatch ? guidMatch[1] : link);

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

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildRss(events, category) {
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

function createEventId(url, title) {
  return `${url}::${title}`;
}

function normalizeEvent(event) {
  const publishedAt = Number.isFinite(Number(event.published_at))
    ? Math.floor(Number(event.published_at))
    : Math.round(Date.now() / 1000);

  return {
    ...event,
    title: String(event.title ?? "").slice(0, 500),
    description: String(event.description ?? "").slice(0, 8000),
    url: String(event.url ?? "").slice(0, 2000),
    source: String(event.source ?? "").slice(0, 100),
    category: String(event.category ?? "tech").slice(0, 50),
    published_at: publishedAt,
    fetched_at: Math.round(Date.now() / 1000),
    created_at: Math.round(Date.now() / 1000),
  };
}

async function saveEvent(env, event) {
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

async function cacheHotEvent(env, event) {
  if (!env.HOT_EVENTS) return;
  const ttl = Number(env.HOT_EVENT_TTL_SECONDS) || 300;
  await env.HOT_EVENTS.put(`event:hot:${event.id}`, JSON.stringify(event), { expirationTtl: ttl });
}

async function getCachedFeed(env, key) {
  return env.FEED_CACHE ? env.FEED_CACHE.get(key) : null;
}

async function cacheFeed(env, key, content, ttlSeconds) {
  if (!env.FEED_CACHE) return;
  await env.FEED_CACHE.put(key, content, { expirationTtl: ttlSeconds });
}

async function isDuplicate(env, id) {
  const row = await env.RSS_DB.prepare("SELECT 1 FROM events WHERE id = ? LIMIT 1").bind(id).first();
  return row !== null;
}

async function markDuplicate(env, id) {
  return;
}

async function runFetchPipeline(env) {
  const collected = [];

  for (const feed of FEEDS) {
    try {
      const response = await fetch(feed.url, {
        headers: {
          Accept: "application/rss+xml, application/xml, text/xml",
          "User-Agent": "Mozilla/5.0 (compatible; RSS-Feed-Worker/1.0)",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!response.ok) continue;
      const xmlText = await response.text();
      const parsed = parseRssXml(xmlText);

      const events = parsed
        .filter((item) => item.title && item.url)
        .map((item) =>
          normalizeEvent({
            ...item,
            source: feed.source,
            category: feed.category,
            id: item.id || createEventId(item.url, item.title),
          })
        );

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
  }, {});

  const deduped = Object.values(grouped).map((event) => ({
    ...event,
    score: calculateScore(event),
  }));

  const saved = [];
  for (const event of deduped) {
    try {
      if (await isDuplicate(env, event.id)) continue;
      await markDuplicate(env, event.id);
      await saveEvent(env, event);
      if (shouldPublish(event.score)) {
        await cacheHotEvent(env, event);
      }
      saved.push(event);
    } catch (error) {
      console.error(`Failed to persist event ${event.id}`, error);
    }
  }

  return saved;
}

function parseQueryInt(value, fallback) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function queryEvents(env, category, minScore = 0, limit = 50) {
  const params = [];
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

  const result = await env.RSS_DB.prepare(sql).bind(...params).all();
  return result.results ?? [];
}

async function handleEventsRequest(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || undefined;
  const minScore = parseQueryInt(url.searchParams.get("min_score"), 0);
  const limit = parseQueryInt(url.searchParams.get("limit"), 50);

  const events = await queryEvents(env, category, minScore, limit);
  return new Response(JSON.stringify({ data: events }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRunRequest(env) {
  const saved = await runFetchPipeline(env);
  return new Response(JSON.stringify({ ok: true, count: saved.length, items: saved.slice(0, 5) }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRssRequest(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || undefined;
  const minScore = parseQueryInt(url.searchParams.get("min_score"), RSS_SCORE_THRESHOLD);
  const feedKey = `feed:${category || "all"}:min_score:${minScore}`;

  const cached = await getCachedFeed(env, feedKey);
  if (cached) {
    return new Response(cached, { headers: { "Content-Type": "application/rss+xml" } });
  }

  const events = await queryEvents(env, category, minScore, 50);
  const rss = buildRss(events, category);
  const ttl = Number(env.DEFAULT_FEED_TTL_SECONDS) || 1800;
  await cacheFeed(env, feedKey, rss, ttl);

  return new Response(rss, { headers: { "Content-Type": "application/rss+xml" } });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/events") return handleEventsRequest(request, env);
  if (url.pathname === "/rss") return handleRssRequest(request, env);
  if (url.pathname === "/run") return handleRunRequest(env);
  return new Response("Not found", { status: 404 });
}

export default {
  fetch: async (request, env) => handleRequest(request, env),
  scheduled: async (controller, env) => {
    await runFetchPipeline(env);
    controller.waitUntil(Promise.resolve());
  },
};
