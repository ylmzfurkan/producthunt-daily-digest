import express from "express";
import { exec } from "node:child_process";
import path from "node:path";
import { ROOT, PORT } from "./config.js";
import { getDays, getDay } from "./db.js";

const app = express();
app.use(express.static(path.join(ROOT, "public")));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Clean URL for the dashboard (public/index.html is the landing page)
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "dashboard.html"));
});

// Available days (every day that has data), newest first
app.get("/api/days", (_req, res) => {
  res.json(getDays());
});

// Combined data for a day: products + AI summaries
app.get("/api/day/:date", (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "Invalid date" });
  const day = getDay(date);
  if (!day) return res.status(404).json({ error: `No data for ${date}` });
  res.json(day);
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`🚀 Server ready: ${url}`);
  if (process.argv.includes("--open")) {
    exec(`open ${url}`);
  }
});
