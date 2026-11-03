// lib/appData.js
//
// Writes a consolidated, Mini-App-friendly record of each processed news
// event into Upstash, under a single capped list key: "app:news".
// The Mini App never talks to Upstash directly (that would expose the
// token); instead a small serverless proxy (see api/news.js in the
// Mini App project) reads this key server-side and serves it as plain
// JSON to the app.
//
// NOTE ON TRANSLATION: the bot only knows how to write English text for
// the "reason" / "note" fields. The Mini App's UI chrome is fully
// localized (EN/RU/ZH), but this live content will show in English
// regardless of the language the user picks, until a translation step
// is added (e.g. calling the Claude API with your own key — see the
// README "Optional: AI-generated explanations" section).

const { getJSON, setJSON } = require('./storage');

const APP_NEWS_KEY = 'app:news';
const MAX_ITEMS = 60;

function dayBucket(eventTime) {
  // Finnhub's economic calendar gives `time` as a "YYYY-MM-DD HH:MM:SS" string, not unix seconds.
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const eventDate = new Date(eventTime);
  const eventStr = eventDate.toISOString().slice(0, 10);
  if (eventStr === todayStr) return 'today';
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  if (eventStr === yesterday) return 'yesterday';
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  if (eventStr === tomorrow) return 'tomorrow';
  return eventStr < todayStr ? 'yesterday' : 'tomorrow'; // fallback bucket
}

function buildReason(event, direction) {
  // Simple templated English explanation, the same logic the Telegram
  // message already uses, kept short enough for a mobile card.
  const dirWord = direction === 'bull' ? 'positive' : 'negative';
  return `Actual (${event.actual}) came in ${direction === 'bull' ? 'higher' : 'lower'} than the previous reading (${event.prev}), which is typically ${dirWord} for ${event.currency}. (No analyst forecast is available from this data source.)`;
}

/**
 * Call this from monitor.js right after a signal is computed and sent
 * to Telegram, so the Mini App shows the same event.
 */
async function publishNewsItem(event, analysisResult) {
  // Defensive guard: never publish an event whose actual figure hasn't
  // been released yet, even if a future code change forgets to filter
  // for this upstream in monitor.js.
  if (event.actual === null || event.actual === undefined || event.actual === "") {
    return;
  }

  const existing = (await getJSON(APP_NEWS_KEY)) || [];
  const item = {
    id: `${event.currency}-${event.event}-${event.time}`.replace(/\s+/g, '_'),
    day: dayBucket(event.time),
    currency: event.currency,
    name: event.event,
    time: new Date(event.time).toISOString(),
    actual: event.actual ?? null,
    forecast: null, // Finance Calendar does not provide analyst forecasts
    previous: event.prev ?? null,
    impact: (event.impact || 'medium').toLowerCase(),
    direction: analysisResult ? analysisResult.direction : null,
    confidence: analysisResult ? analysisResult.confidence : null,
    reason: analysisResult ? buildReason(event, analysisResult.direction) : null,
    publishedAt: new Date().toISOString(),
  };
  const deduped = existing.filter(x => x.id !== item.id);
  deduped.unshift(item);
  await setJSON(APP_NEWS_KEY, deduped.slice(0, MAX_ITEMS));
}

module.exports = { publishNewsItem, APP_NEWS_KEY };
