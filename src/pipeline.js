import { fetchDay } from "./fetch.js";
import { summarizeDay } from "./summarize.js";
import { phToday, assertValidDate } from "./config.js";

export async function runPipeline(date, { force = false, all = false } = {}) {
  await fetchDay(date, { force, all });
  await summarizeDay(date, all ? { top: 0 } : {});
}

// Doğrudan çalıştırma: node src/pipeline.js [YYYY-MM-DD] [--force] [--all]
if (process.argv[1] && process.argv[1].endsWith("pipeline.js")) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const all = args.includes("--all");
  const dateArg = args.find((a) => !a.startsWith("--"));
  const date = dateArg ? assertValidDate(dateArg) : phToday();
  runPipeline(date, { force, all }).catch((err) => {
    console.error("❌ " + err.message);
    process.exit(1);
  });
}
