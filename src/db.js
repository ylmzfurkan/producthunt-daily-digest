import Database from "better-sqlite3";
import { DB_PATH, ensureDataDir } from "./config.js";

ensureDataDir();

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    date           TEXT NOT NULL,
    id             TEXT NOT NULL,
    name           TEXT,
    tagline        TEXT,
    description    TEXT,
    votes_count    INTEGER,
    comments_count INTEGER,
    url            TEXT,
    website        TEXT,
    thumbnail      TEXT,
    created_at     TEXT,
    topics         TEXT,   -- JSON array
    summary        TEXT,
    audience       TEXT,
    highlight      TEXT,
    fetched_at     TEXT,
    PRIMARY KEY (date, id)
  );
`);

// Insert or update the raw product fields for a day. Existing AI summaries are
// preserved on re-fetch (only the raw/vote fields are refreshed).
const upsertStmt = db.prepare(`
  INSERT INTO products
    (date, id, name, tagline, description, votes_count, comments_count,
     url, website, thumbnail, created_at, topics, fetched_at)
  VALUES
    (@date, @id, @name, @tagline, @description, @votes_count, @comments_count,
     @url, @website, @thumbnail, @created_at, @topics, @fetched_at)
  ON CONFLICT(date, id) DO UPDATE SET
    name = excluded.name,
    tagline = excluded.tagline,
    description = excluded.description,
    votes_count = excluded.votes_count,
    comments_count = excluded.comments_count,
    url = excluded.url,
    website = excluded.website,
    thumbnail = excluded.thumbnail,
    created_at = excluded.created_at,
    topics = excluded.topics,
    fetched_at = excluded.fetched_at
`);

export const upsertProducts = db.transaction((date, posts, fetchedAt) => {
  for (const p of posts) {
    upsertStmt.run({
      date,
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      votes_count: p.votesCount ?? 0,
      comments_count: p.commentsCount ?? 0,
      url: p.url ?? null,
      website: p.website ?? null,
      thumbnail: p.thumbnail ?? null,
      created_at: p.createdAt ?? null,
      topics: JSON.stringify(p.topics ?? []),
      fetched_at: fetchedAt,
    });
  }
});

const setSummaryStmt = db.prepare(`
  UPDATE products SET summary = @summary, audience = @audience, highlight = @highlight
  WHERE date = @date AND id = @id
`);

export const setSummaries = db.transaction((date, byId) => {
  for (const [id, s] of Object.entries(byId)) {
    setSummaryStmt.run({
      date,
      id,
      summary: s.summary,
      audience: s.audience ?? "",
      highlight: s.highlight ?? "",
    });
  }
});

export function dayHasData(date) {
  return db.prepare("SELECT 1 FROM products WHERE date = ? LIMIT 1").get(date) != null;
}

// Raw product rows for a day, most-upvoted first (used by the summarizer).
export function getProducts(date) {
  const rows = db
    .prepare("SELECT * FROM products WHERE date = ? ORDER BY votes_count DESC")
    .all(date);
  return rows.map(rowToPost);
}

// Distinct days that have data, newest first.
export function getDays() {
  return db
    .prepare("SELECT DISTINCT date FROM products ORDER BY date DESC")
    .all()
    .map((r) => r.date);
}

// Full day payload for the API: { date, fetchedAt, posts }.
export function getDay(date) {
  const rows = db
    .prepare("SELECT * FROM products WHERE date = ? ORDER BY votes_count DESC")
    .all(date);
  if (rows.length === 0) return null;
  const fetchedAt = rows.reduce((max, r) => (r.fetched_at > max ? r.fetched_at : max), "");
  return { date, fetchedAt, posts: rows.map(rowToPost) };
}

// Keep only the N most-recent days; delete everything older.
export function pruneToLastNDays(n) {
  const keep = db
    .prepare("SELECT DISTINCT date FROM products ORDER BY date DESC LIMIT ?")
    .all(n)
    .map((r) => r.date);
  if (keep.length < n) return 0; // nothing to prune yet
  const cutoff = keep[keep.length - 1];
  const info = db.prepare("DELETE FROM products WHERE date < ?").run(cutoff);
  return info.changes;
}

function rowToPost(r) {
  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    description: r.description,
    votesCount: r.votes_count,
    commentsCount: r.comments_count,
    url: r.url,
    website: r.website,
    thumbnail: r.thumbnail,
    createdAt: r.created_at,
    topics: JSON.parse(r.topics ?? "[]"),
    summary: r.summary
      ? { summary: r.summary, audience: r.audience ?? "", highlight: r.highlight ?? "" }
      : null,
  };
}

export default db;
