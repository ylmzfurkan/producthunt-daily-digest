import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  DATA_RAW,
  DATA_SUMMARY,
  ensureDataDirs,
  getOpenAIKey,
  getModel,
  phToday,
  assertValidDate,
} from "./config.js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const BATCH_SIZE = 10;
// Hundreds of products are posted daily but most stay under 5 votes;
// by default only the top N most-upvoted products are summarized.
const DEFAULT_TOP = 50;

function buildPrompt(products) {
  const list = products.map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    topics: p.topics,
  }));
  return [
    "Below is information about products posted on Product Hunt.",
    "For each product, write the following in clear, plain English:",
    '- "summary": 2-3 sentences describing what the product does and how it helps',
    '- "audience": 1 sentence saying who it is for',
    '- "highlight": 1 sentence on what stands out or is interesting about it',
    "",
    "Return ONLY a valid JSON array, nothing else (no markdown code fence).",
    'Format: [{"id": "...", "summary": "...", "audience": "...", "highlight": "..."}]',
    "Keep each product's id field exactly as given.",
    "",
    "Products:",
    JSON.stringify(list, null, 2),
  ].join("\n");
}

function extractJsonArray(text) {
  // Olası code fence veya çevresindeki metni temizle
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in the response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function summarizeBatch(products) {
  const prompt = buildPrompt(products);
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getOpenAIKey()}`,
    },
    body: JSON.stringify({
      model: getModel(),
      messages: [
        {
          role: "system",
          content:
            "You are a concise tech writer who explains new products clearly and factually.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (res.status === 401) {
    throw new Error("OpenAI rejected the API key (HTTP 401). Check OPENAI_API_KEY in .env.");
  }
  if (res.status === 429) {
    throw new Error("OpenAI rate limit hit (HTTP 429). Try again in a moment.");
  }
  if (!res.ok) {
    throw new Error(`OpenAI API error: HTTP ${res.status} — ${await res.text()}`);
  }
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }
  const items = extractJsonArray(text);
  const byId = {};
  for (const item of items) {
    if (item.id && item.summary) {
      byId[item.id] = {
        summary: item.summary,
        audience: item.audience ?? "",
        highlight: item.highlight ?? "",
      };
    }
  }
  return byId;
}

export async function summarizeDay(date, { top = DEFAULT_TOP } = {}) {
  ensureDataDirs();
  const rawPath = path.join(DATA_RAW, `${date}.json`);
  if (!existsSync(rawPath)) {
    throw new Error(`No raw data for ${date}. Run first: npm run fetch -- ${date}`);
  }
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const outPath = path.join(DATA_SUMMARY, `${date}.json`);

  const targets = [...raw.posts]
    .sort((a, b) => b.votesCount - a.votesCount)
    .slice(0, top || raw.posts.length);

  const existing = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8")).summaries
    : {};
  const pending = targets.filter((p) => !existing[p.id]);

  if (pending.length === 0) {
    console.log(`✓ Summaries for ${date} are already ready (${targets.length} products).`);
    return;
  }
  if (top && raw.posts.length > targets.length) {
    console.log(
      `ℹ Of ${raw.posts.length} products, the top ${targets.length} most-upvoted will be summarized ` +
        `(use --all for all of them).`
    );
  }

  console.log(`⏳ Summarizing ${pending.length} products (in batches of ${BATCH_SIZE})...`);
  const summaries = { ...existing };
  let failed = 0;

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const label = `grup ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)}`;
    let batchResult = null;
    for (let attempt = 1; attempt <= 2 && !batchResult; attempt++) {
      try {
        batchResult = await summarizeBatch(batch);
      } catch (err) {
        console.warn(`⚠ ${label} attempt ${attempt} failed: ${err.message}`);
      }
    }
    if (batchResult) {
      Object.assign(summaries, batchResult);
      const missing = batch.filter((p) => !batchResult[p.id]);
      failed += missing.length;
      console.log(`✓ ${label}: got ${Object.keys(batchResult).length} summaries`);
    } else {
      failed += batch.length;
      console.warn(`⚠ ${label} skipped; these products will show without a summary.`);
    }
    // Ara kayıt: uzun koşularda yarıda kesilirse emek kaybolmasın
    writeFileSync(
      outPath,
      JSON.stringify({ date, generatedAt: new Date().toISOString(), summaries }, null, 2)
    );
  }

  console.log(
    `✓ Summarizing done: ${Object.keys(summaries).length} summaries` +
      (failed ? `, ${failed} products could not be summarized` : "") +
      ` → ${outPath}`
  );
}

// Doğrudan çalıştırma: node src/summarize.js [YYYY-MM-DD] [--all]
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = process.argv.slice(2);
  const dateArg = args.find((a) => !a.startsWith("--"));
  const date = dateArg ? assertValidDate(dateArg) : phToday();
  const top = args.includes("--all") ? 0 : DEFAULT_TOP;
  summarizeDay(date, { top }).catch((err) => {
    console.error("❌ " + err.message);
    process.exit(1);
  });
}
