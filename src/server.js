import express from "express";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { exec } from "node:child_process";
import path from "node:path";
import { ROOT, DATA_RAW, DATA_SUMMARY, PORT, ensureDataDirs } from "./config.js";

ensureDataDirs();
const app = express();
app.use(express.static(path.join(ROOT, "public")));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Clean URL for the dashboard (public/index.html is the landing page)
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "dashboard.html"));
});

// Available days (every day that has raw data)
app.get("/api/days", (_req, res) => {
  const days = readdirSync(DATA_RAW)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort()
    .reverse();
  res.json(days);
});

// Combined data for a day: raw products + AI summaries
app.get("/api/day/:date", (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "Invalid date" });

  const rawPath = path.join(DATA_RAW, `${date}.json`);
  if (!existsSync(rawPath)) {
    return res.status(404).json({ error: `No data for ${date}` });
  }
  const raw = JSON.parse(readFileSync(rawPath, "utf8"));
  const summaryPath = path.join(DATA_SUMMARY, `${date}.json`);
  const summaries = existsSync(summaryPath)
    ? JSON.parse(readFileSync(summaryPath, "utf8")).summaries
    : {};

  const posts = raw.posts
    .map((p) => ({ ...p, summary: summaries[p.id] ?? null }))
    .sort((a, b) => b.votesCount - a.votesCount);

  res.json({ date, fetchedAt: raw.fetchedAt, posts });
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`🚀 Server ready: ${url}`);
  if (process.argv.includes("--open")) {
    exec(`open ${url}`);
  }
});
