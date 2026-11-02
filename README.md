# News Signal Bot — Telegram economic news signal bot

This bot watches economic calendar data aggregated from official sources
(via Finnhub — the BLS, RBA, BOE, and other official agencies), compares
newly released figures against their forecasts, sends heuristic signals
for XAUUSD and major forex pairs, then a few hours later checks how the
price actually moved and sends a follow-up analysis.

## ⚠️ Important limitations (please read)

1. **The "confidence score" (70/100, etc.) is not a scientific forecast.**
   It's just a simple formula based on the size of the gap between the
   actual and forecast figures. No bot can guarantee market movements.
2. **The follow-up analysis is not proof of cause and effect either.**
   It only shows whether the price matched the signal's direction, and
   (if configured) adds news headlines from that period.
3. This bot **never executes any trades automatically** — it only sends
   signals. The decision is yours.
4. Finnhub's free tier has a limited number of requests — if you poll
   too frequently, you may hit the rate limit.

## Required free services

| Service | What it's for | Where to get it |
|---|---|---|
| Telegram Bot | Sending signals | `/newbot` via [@BotFather](https://t.me/BotFather) |
| Finnhub | Economic calendar + forex prices | https://finnhub.io/register |
| Upstash Redis | Storing state (which signals were sent) | https://upstash.com (Redis → Create Database → REST API) |
| NewsAPI.org (optional) | News headlines for follow-ups | https://newsapi.org/register |

## Setup steps

### 1. Create a Telegram bot
1. Message [@BotFather](https://t.me/BotFather) on Telegram and send `/newbot`.
2. Choose a name for your bot — it gives you a **token** (e.g. `123456:ABC-DEF...`) — save it.
3. Send any message to your bot (e.g. "hello"), then open this in your browser:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
   and find the `"chat":{"id": ...}` value in the response — that's your **CHAT_ID**.

### 2. Get a Finnhub key
https://finnhub.io/register — sign up, your API key appears on the dashboard.

### 3. Upstash Redis
https://upstash.com — sign up → Redis → Create Database (Regional, free)
→ grab `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the "REST API" section.

### 4. (Optional) NewsAPI
https://newsapi.org/register — get a free key. The bot works fine
without it too; follow-up messages just won't include news headlines.

### 5. Push the project to GitHub
```bash
cd news-signal-bot
git init
git add .
git commit -m "Initial commit"
# Create a new empty repo on GitHub, then:
git remote add origin https://github.com/<username>/<repo>.git
git branch -M main
git push -u origin main
```

### 6. Configure GitHub Secrets
On the repo page: **Settings → Secrets and variables → Actions → New repository secret**
Add the following:
- `FINNHUB_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEWSAPI_KEY` (optional)

### 7. Start it up
GitHub Actions will automatically run on the schedules in
`.github/workflows/monitor.yml` and `followup.yml` (every 10 and 15
minutes respectively). To try it manually the first time:
**Actions** tab → "Monitor Economic Calendar" → **Run workflow**.

## Testing locally

```bash
npm install
cp .env.example .env
# fill in your keys in .env
npm run monitor
npm run followup
```

## Integration with the Mini App

`lib/appData.js` also writes every signal it sends into Upstash under
the `app:news` key (the most recent 60 are kept). This is read by
`api/news.js` (a Vercel serverless function) in the separate
`mini-app-project/` project, and served to the Mini App's News tab.

For token security, the Mini App never connects to Upstash
**directly** — only through that small API, so the token never reaches
the browser. The full diagram is in `mini-app-project/README.md`.

## How to extend this

- Add new event types (e.g. Retail Sales, Trade Balance) to the
  `EVENT_RULES` list in `lib/analysis.js`.
- Add new pairs to `WATCHED_PAIRS` in `lib/analysis.js`.
- Change `FOLLOWUP_DELAY_MINUTES` to adjust how many minutes after a
  signal the follow-up gets sent (`.github/workflows/followup.yml`).
- If you want real AI-generated explanations (not a template, but
  natural language), you could send `lib/news.js`'s output to Claude
  via your own Anthropic API key and generate a natural-language
  explanation — ask if you'd like this added.
