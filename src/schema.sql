CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  url TEXT,
  source TEXT,
  category TEXT,
  published_at INTEGER,
  fetched_at INTEGER,
  score REAL,
  cross_sources INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  url TEXT,
  type TEXT,
  reliability REAL,
  active INTEGER
);
