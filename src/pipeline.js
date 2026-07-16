import { fetchDay } from "./fetch.js";
import { summarizeDay } from "./summarize.js";
import { phToday, phYesterday, assertValidDate, RETENTION_DAYS } from "./config.js";
import { pruneToLastNDays } from "./db.js";

export async function runPipeline(date, { force = false, all = false } = {}) {
  await fetchDay(date, { force, all });
  await summarizeDay(date, all ? { top: 0 } : {});
  const removed = pruneToLastNDays(RETENTION_DAYS);
  if (removed > 0) {
    console.log(`🧹 Pruned ${removed} products older than the last ${RETENTION_DAYS} days.`);
  }
}

// Direct run: node src/pipeline.js [YYYY-MM-DD] [--yesterday] [--force] [--all]
if (process.argv[1] && process.argv[1].endsWith("pipeline.js")) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const all = args.includes("--all");
  const dateArg = args.find((a) => !a.startsWith("--"));
  const date = dateArg
    ? assertValidDate(dateArg)
    : args.includes("--yesterday")
      ? phYesterday()
      : phToday();
  runPipeline(date, { force, all }).catch((err) => {
    console.error("❌ " + err.message);
    process.exit(1);
  });
}
