import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  DATA_RAW,
  getToken,
  ensureDataDirs,
  phToday,
  phDayRange,
  assertValidDate,
} from "./config.js";

const API_URL = "https://api.producthunt.com/v2/api/graphql";

// Özetleme yalnızca en çok oy alan ilk 50 ürünü kullandığı için varsayılan
// olarak çekimi de 50'de durduruyoruz. Sorgu VOTES sıralı geldiğinden ilk 50
// benzersiz ürün = en çok oy alan 50 ürün. Tümü için: fetchDay(..., { all: true }).
const DEFAULT_LIMIT = 50;

const QUERY = `
query DailyPosts($postedAfter: DateTime!, $postedBefore: DateTime!, $after: String) {
  posts(order: VOTES, postedAfter: $postedAfter, postedBefore: $postedBefore, first: 20, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      tagline
      description
      votesCount
      commentsCount
      url
      website
      createdAt
      thumbnail { url }
      topics(first: 5) { nodes { name } }
    }
  }
}`;

async function gql(token, variables) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: QUERY, variables }),
  });
  if (res.status === 401 || res.status === 403) {
    console.error(
      "❌ Product Hunt API token'ı reddetti (HTTP " +
        res.status +
        "). .env dosyasındaki PH_TOKEN değerini kontrol et.\n" +
        "Yeni token: https://www.producthunt.com/v2/oauth/applications → Developer Token"
    );
    process.exit(1);
  }
  if (res.status === 429) {
    throw new Error("Rate limit aşıldı (HTTP 429). Birkaç dakika sonra tekrar dene.");
  }
  if (!res.ok) {
    throw new Error(`API hatası: HTTP ${res.status} — ${await res.text()}`);
  }
  const body = await res.json();
  if (body.errors?.length) {
    throw new Error("GraphQL hatası: " + JSON.stringify(body.errors));
  }
  return body.data;
}

export async function fetchDay(date, { force = false, all = false } = {}) {
  const limit = all ? Infinity : DEFAULT_LIMIT;
  ensureDataDirs();
  const outPath = path.join(DATA_RAW, `${date}.json`);
  if (!force && existsSync(outPath)) {
    const cached = JSON.parse(readFileSync(outPath, "utf8"));
    console.log(`✓ ${date} zaten cache'te (${cached.posts.length} ürün): ${outPath}`);
    return cached;
  }

  const token = getToken();
  const { postedAfter, postedBefore } = phDayRange(date);
  // Oylar çekim sırasında değiştikçe VOTES sıralı sayfalama aynı ürünü
  // birden fazla sayfada döndürebiliyor; id üzerinden tekilleştiriyoruz.
  const byId = new Map();
  let after = null;

  console.log(`⏳ ${date} günü Product Hunt'tan çekiliyor...`);
  do {
    const data = await gql(token, { postedAfter, postedBefore, after });
    const page = data.posts;
    for (const node of page.nodes) {
      byId.set(node.id, {
        id: node.id,
        name: node.name,
        tagline: node.tagline,
        description: node.description,
        votesCount: node.votesCount,
        commentsCount: node.commentsCount,
        url: node.url,
        website: node.website,
        createdAt: node.createdAt,
        thumbnail: node.thumbnail?.url ?? null,
        topics: node.topics.nodes.map((t) => t.name),
      });
    }
    // Yeterince benzersiz ürün topladıysak sonraki sayfaları çekmeyi bırak.
    if (byId.size >= limit) break;
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  const posts = [...byId.values()].slice(0, limit === Infinity ? undefined : limit);
  const result = { date, fetchedAt: new Date().toISOString(), posts };
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`✓ ${posts.length} ürün kaydedildi: ${outPath}`);
  return result;
}

// Doğrudan çalıştırma: node src/fetch.js [YYYY-MM-DD] [--force] [--all]
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const all = args.includes("--all");
  const dateArg = args.find((a) => !a.startsWith("--"));
  const date = dateArg ? assertValidDate(dateArg) : phToday();
  fetchDay(date, { force, all }).catch((err) => {
    console.error("❌ " + err.message);
    process.exit(1);
  });
}
