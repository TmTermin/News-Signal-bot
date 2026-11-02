// scripts/followup.js
// Runs every 15 minutes via GitHub Actions.
// Finds events monitor.js already sent a signal for, and once the
// configured delay (FOLLOWUP_DELAY_MINUTES) has passed, checks how the
// price actually moved and (optionally) looks up related headlines,
// then sends a plain-language explanation message.
//
// IMPORTANT: this "analysis" is not scientific proof of cause and
// effect — it only compares the price's actual direction against the
// signal's direction and shows whether they matched, plus (if
// configured) adds news headlines from that period.

require("dotenv").config();
const { getForexQuote } = require("../lib/finnhub");
const { sendMessage } = require("../lib/telegram");
const { scanKeys, getJSON, setJSON } = require("../lib/storage");
const { getRelatedHeadlines } = require("../lib/news");

const FOLLOWUP_DELAY_MINUTES = parseInt(process.env.FOLLOWUP_DELAY_MINUTES || "120", 10);

// Mapping to Finnhub's OANDA symbols
const FINNHUB_SYMBOL = {
  XAUUSD: "OANDA:XAU_USD",
  EURUSD: "OANDA:EUR_USD",
  GBPUSD: "OANDA:GBP_USD",
  AUDUSD: "OANDA:AUD_USD",
  NZDUSD: "OANDA:NZD_USD",
  USDJPY: "OANDA:USD_JPY",
  USDCAD: "OANDA:USD_CAD",
};

function minutesSince(isoString) {
  return (Date.now() - new Date(isoString).getTime()) / 60000;
}

function formatFollowupMessage(event, pairResults) {
  const lines = [];
  lines.push(`📈 <b>Follow-up analysis: ${event.event}</b> (${event.currency})`);
  lines.push("");
  for (const r of pairResults) {
    const matchEmoji = r.matched ? "✅ signal was correct" : "❌ signal was wrong";
    lines.push(
      `<b>${r.pair}</b>: ${r.priceChangePct > 0 ? "📈" : "📉"} ${r.priceChangePct.toFixed(
        2
      )}% (over ${FOLLOWUP_DELAY_MINUTES} min) — ${matchEmoji}`
    );
  }
  if (pairResults[0]?.headlines?.length) {
    lines.push("");
    lines.push("📰 <b>Related headlines from this period:</b>");
    for (const h of pairResults[0].headlines.slice(0, 3)) {
      lines.push(`• ${h.title} (${h.source})`);
    }
  }
  lines.push("");
  lines.push(
    "⚠️ This is a simple price-move comparison, not proof of cause and effect. Multiple factors can affect price at the same time."
  );
  return lines.join("\n");
}

async function main() {
  const keys = await scanKeys("event:*");
  console.log(`Checking ${keys.length} key(s)`);

  for (const key of keys) {
    const state = await getJSON(key);
    if (!state || !state.notified || state.followupDone) continue;
    if (minutesSince(state.notifiedAt) < FOLLOWUP_DELAY_MINUTES) continue;

    const { event, pairSignals } = state;
    const pairResults = [];

    for (const s of pairSignals) {
      const symbol = FINNHUB_SYMBOL[s.pair];
      if (!symbol) continue;
      try {
        const quote = await getForexQuote(symbol);
        // quote.pc = previous close (used as the approximate starting point)
        const priceChangePct = ((quote.c - quote.pc) / quote.pc) * 100;
        const actualDirection = priceChangePct > 0 ? "bullish" : "bearish";
        const matched = actualDirection === s.direction;
        pairResults.push({ pair: s.pair, priceChangePct, matched, headlines: [] });
      } catch (err) {
        console.error(`Failed to fetch price for ${s.pair}:`, err.message);
      }
    }

    if (pairResults.length === 0) continue;

    // Optional: add related news headlines
    const headlines = await getRelatedHeadlines(
      `${event.currency} ${event.event}`,
      state.notifiedAt.slice(0, 10)
    );
    if (pairResults[0]) pairResults[0].headlines = headlines;

    const message = formatFollowupMessage(event, pairResults);
    await sendMessage(message);

    await setJSON(key, { ...state, followupDone: true, followupAt: new Date().toISOString() });
    console.log(`Follow-up sent: ${event.event}`);
  }
}

main().catch((err) => {
  console.error("followup.js error:", err);
  process.exit(1);
});
