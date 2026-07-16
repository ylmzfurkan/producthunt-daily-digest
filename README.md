# 🚀 Product Hunt Daily Digest

A daily, AI-summarized digest of the top products launched on [Product Hunt](https://www.producthunt.com).
Each evening it fetches the day's most-upvoted launches, generates a short plain-English
summary for each (what it does, who it's for, what stands out), and serves them on a simple
dashboard. No sign-up, no login.

- **Landing page** (`/`) — explains the site and links to the dashboard.
- **Dashboard** (`/dashboard`) — browse the day, filter by category, search.

## How it works

```
Daily cron (e.g. 21:00 Europe)
   ├─ fetch.js      → pull the day's top products from the Product Hunt API
   ├─ summarize.js  → generate an English summary per product (OpenAI GPT-4.1-mini)
   └─ writes JSON into data/
                         ↓
   server.js (always running) → serves the landing page + dashboard from data/
```

Users only ever read pre-generated data — no AI calls happen on page load, so the site is
fast and the cost is fixed and tiny.

## Requirements

- Node.js 18+ (uses the built-in `fetch`)
- A **Product Hunt developer token** — https://www.producthunt.com/v2/oauth/applications
- An **OpenAI API key** — https://platform.openai.com/api-keys

## Setup (local)

```bash
git clone <your-repo-url>
cd producthunt
npm install
cp .env.example .env      # then fill in PH_TOKEN and OPENAI_API_KEY
```

Generate a day and open the dashboard:

```bash
npm start                 # runs the pipeline for today, then serves + opens the browser
```

Or run the steps individually:

```bash
npm run pipeline          # fetch + summarize today
npm run pipeline -- 2026-07-15   # a specific day
npm run pipeline -- --all        # summarize all products, not just the top 50
npm run serve             # just serve the dashboard (no fetch/summarize)
```

## Configuration

| Env var          | Required | Default        | Notes                                  |
| ---------------- | -------- | -------------- | -------------------------------------- |
| `PH_TOKEN`       | yes      | —              | Product Hunt developer token           |
| `OPENAI_API_KEY` | yes      | —              | OpenAI API key                         |
| `OPENAI_MODEL`   | no       | `gpt-4.1-mini` | Override the summarization model       |

## Deploy on a VPS

The app is a plain Node server plus a daily job — a small VPS ($5/mo) is plenty.

**1. Get the code and dependencies on the server**

```bash
git clone <your-repo-url> /opt/producthunt
cd /opt/producthunt
npm install --omit=dev
cp .env.example .env      # fill in PH_TOKEN and OPENAI_API_KEY
```

**2. Run the server continuously with pm2**

```bash
npm install -g pm2
pm2 start src/server.js --name producthunt
pm2 save
pm2 startup               # follow the printed command so it restarts on reboot
```

The server listens on port **3717**. Put nginx (or Caddy) in front of it for a domain + HTTPS.

**3. Schedule the daily update with cron**

Edit the crontab (`crontab -e`) and add:

```cron
# Run at 21:00 Europe time every day
CRON_TZ=Europe/Istanbul
0 21 * * * cd /opt/producthunt && /usr/bin/node src/pipeline.js >> /opt/producthunt/cron.log 2>&1
```

- `CRON_TZ` makes the schedule fire at 21:00 in that timezone regardless of the server's
  own timezone (supported by the default cron on Debian/Ubuntu). Change it to your zone
  (e.g. `Europe/Berlin`).
- Check `which node` on the server and use that full path if it isn't `/usr/bin/node`.

> **Note on which day you capture.** Product Hunt's daily leaderboard resets at midnight
> US Pacific time and keeps gaining votes all day. Running at 21:00 Europe (~noon Pacific)
> captures *today so far* — a mid-day snapshot. If you'd rather show the fully-settled
> previous day, schedule the job for the early European morning instead; it will pull that
> completed day.

## Cost

Summarizing ~50 products/day with `gpt-4.1-mini` costs roughly **$1–2 per month**. Summaries
are generated once per day and cached as JSON, so traffic to the site adds no AI cost.

## License

MIT
