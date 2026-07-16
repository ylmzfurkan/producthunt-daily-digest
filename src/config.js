import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..");
export const DATA_RAW = path.join(ROOT, "data", "raw");
export const DATA_SUMMARY = path.join(ROOT, "data", "summary");
export const PORT = 3717;

// Basit .env okuyucu — tek değişkenimiz var, dotenv paketine gerek yok
function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

export function getToken() {
  const token = loadEnv().PH_TOKEN || process.env.PH_TOKEN;
  if (!token) {
    console.error(
      [
        "❌ Product Hunt token not found.",
        "",
        "To get a token:",
        "  1. Go to https://www.producthunt.com/v2/oauth/applications",
        '  2. Create an application with "Add an application" (redirect URI: http://localhost:3717)',
        '  3. Click the "Developer Token" button on the app page and copy the token',
        "  4. Add this line to the project's .env file:",
        "     PH_TOKEN=<token>",
        "",
        "(You can copy .env.example to .env)",
      ].join("\n")
    );
    process.exit(1);
  }
  return token;
}

export function getOpenAIKey() {
  const key = loadEnv().OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    console.error(
      [
        "❌ OpenAI API key not found.",
        "",
        "To get a key:",
        "  1. Go to https://platform.openai.com/api-keys",
        '  2. Create a new secret key',
        "  3. Add this line to the project's .env file:",
        "     OPENAI_API_KEY=<key>",
      ].join("\n")
    );
    process.exit(1);
  }
  return key;
}

// Summarization model. Override with OPENAI_MODEL in .env if needed.
export function getModel() {
  return loadEnv().OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

export function ensureDataDirs() {
  mkdirSync(DATA_RAW, { recursive: true });
  mkdirSync(DATA_SUMMARY, { recursive: true });
}

// Product Hunt günü PST/PDT (America/Los_Angeles) tabanlıdır.
// Tarih verilmezse PH saat dilimindeki "bugün"ü döner.
export function phToday() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

// Bir YYYY-MM-DD gününün PH saat dilimindeki başlangıç/bitişini ISO (UTC) olarak döner.
export function phDayRange(date) {
  const utcOffsetOf = (d) => {
    // America/Los_Angeles ofsetini o tarihteki gerçek değerinden hesapla (DST dahil)
    const probe = new Date(`${d}T12:00:00Z`);
    const tzName = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "longOffset",
    })
      .formatToParts(probe)
      .find((p) => p.type === "timeZoneName").value; // ör. "GMT-07:00"
    return tzName.replace("GMT", "") || "+00:00";
  };
  const offset = utcOffsetOf(date);
  const start = new Date(`${date}T00:00:00${offset}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { postedAfter: start.toISOString(), postedBefore: end.toISOString() };
}

export function assertValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
    console.error(`❌ Geçersiz tarih: "${date}". Beklenen biçim: YYYY-MM-DD`);
    process.exit(1);
  }
  return date;
}
