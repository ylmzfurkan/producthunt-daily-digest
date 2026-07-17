# 🚀 Product Hunt Daily Digest

A daily, AI-summarized digest of the top products launched on [Product Hunt](https://www.producthunt.com).
Each evening it fetches the day's most-upvoted launches, generates a short plain-English
summary for each (what it does, who it's for, what stands out), and serves them on a simple
dashboard. No sign-up, no login.

- **Landing page** (`/`) — explains the site and links to the dashboard.
- **Dashboard** (`/dashboard`) — browse the day, filter by category, search.

## How it works

```
Daily cron (08:01 UTC, just after the PH day closes, for the previous day)
   ├─ fetch.js      → pull the day's top products from the Product Hunt API
   ├─ summarize.js  → generate an English summary per product (OpenAI GPT-4.1-mini)
   ├─ stores everything in SQLite (data/digest.db)
   └─ prunes to the most recent 7 days
                         ↓
   server.js (always running) → serves the landing page + dashboard from the database
```

Users only ever read pre-generated data — no AI calls happen on page load, so the site is
fast and the cost is fixed and tiny.

### Data storage

Everything is stored in a single **SQLite** file at `data/digest.db` (created on first run;
no separate database server needed). Each pipeline run keeps only the **most recent 7 days**
and deletes older data automatically, so the dashboard always shows the last week. Adjust the
window with `RETENTION_DAYS` in `src/config.js`.

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

> `better-sqlite3` ships prebuilt binaries for common platforms, so `npm install` usually
> needs no compiler. If it does try to build from source (uncommon), install build tools
> first: `sudo apt-get install -y build-essential python3`.

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
# Run at 08:01 UTC every day, for the previous (fully-settled) PH day
1 8 * * * cd /opt/producthunt && /usr/bin/node src/pipeline.js --yesterday >> /opt/producthunt/cron.log 2>&1
```

- `--yesterday` fetches the **most recently completed** Product Hunt day, so its 24h of
  voting has fully settled into a final ranking.
- The schedule is written in **UTC** (the server's timezone). Don't rely on `CRON_TZ` — on
  some systems the default cron silently ignores it and runs at the server's local time
  instead, which lands mid-day in the Pacific timezone and fetches the wrong (still-open)
  day. Scheduling directly in UTC avoids that footgun.
- Check `which node` on the server and use that full path if it isn't `/usr/bin/node`.

> **Why 08:01 UTC, and why yesterday.** A Product Hunt day resets at midnight **US Pacific**
> time and keeps gaining votes for the full 24h. Midnight Pacific is **07:00 UTC in summer
> (PDT)** and **08:00 UTC in winter (PST)**. Running at **08:01 UTC** fires just after the
> day fully closes in *both* seasons — no DST logic needed — so `--yesterday` always captures
> the just-settled ranking. (Running before Pacific midnight would land inside a
> still-in-progress day and capture an unsettled ranking.)

**4. Domain + HTTPS (nginx + Let's Encrypt)**

Point an `A` record for your domain at the server's IP, then:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/producthunt
# edit the file and replace your-domain.com with your real domain
sudo ln -s /etc/nginx/sites-available/producthunt /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

`certbot` obtains the certificate, rewrites the nginx config to serve HTTPS on 443, and sets
up auto-renewal. Your site is then live at `https://your-domain.com`.

## Cost

Summarizing ~50 products/day with `gpt-4.1-mini` costs roughly **$1–2 per month**. Summaries
are generated once per day and cached as JSON, so traffic to the site adds no AI cost.

## License

MIT
