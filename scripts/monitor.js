// scripts/monitor.js
// Runs every 5-15 minutes via GitHub Actions.
// 1. Fetches today's economic calendar (via Finnhub, aggregated from
//    official sources: the BLS, RBA, BOE, etc.)
// 2. Finds events whose "actual" value has just appeared (i.e. was
//    just released).
// 3. Runs a heuristic analysis on each one and sends a signal to
//    Telegram.
// 4. Writes state to Upstash Redis for scripts/followup.js to use
//    later.

require("dotenv").config();
const { getEconomicCalendar } = require("../lib/finnhub");
const { sendMessage } = require("../lib/telegram");
const { setJSON, getJSON } = require("../lib/storage");
const { analyzeEvent, toPairSignals, WATCHED_PAIRS } = require("../lib/analysis");
const { publishNewsItem } = require("../lib/appData");

const WATCHED_CURRENCIES = new Set(
  Array.from(
    new Set(
      Object.values(WATCHED_PAIRS).flatMap(({ base, quote }) => [base, quote])
    )
  ).filter((c) => c !== "XAU")
);
WATCHED_CURRENCIES.add("XAU"); // events that move gold are needed too (often via USD)

function todayRange() {
  const now = new Date();
  const from = now.toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

function eventKey(event) {
  // A unique key per event: time + name + currency
  return `event:${event.time}:${event.currency}:${event.event}`.replace(/\s+/g, "_");
}

function formatSignalMessage(event, pairSignals) {
  const lines = [];
  lines.push(`🔔 <b>New event released</b>`);
  lines.push(`<b>${event.event}</b> (${event.currency})`);
  lines.push(`Actual: <b>${event.actual}</b> | Forecast: ${event.estimate ?? "—"} | Previous: ${event.prev ?? "—"}`);
  lines.push("");
  lines.push("📊 <b>Heuristic signal (not a scientific forecast):</b>");
  for (const s of pairSignals) {
    const emoji = s.direction === "bullish" ? "🟢 UP" : "🔴 DOWN";
    lines.push(`${s.pair}: ${emoji} — confidence ${s.confidence}/100`);
  }
  lines.push("");
  lines.push("⚠️ This is not financial advice. The confidence score is only a rough estimate based on the size of the surprise.");
  return lines.join("\n");
}

async function main() {
  const { from, to } = todayRange();
  const events = await getEconomicCalendar(from, to);

  const releasedRelevant = events.filter(
    (e) =>
      WATCHED_CURRENCIES.has(e.currency) &&
      e.actual !== null &&
      e.actual !== undefined &&
      e.actual !== ""
  );

  console.log(`Found: ${releasedRelevant.length} relevant released event(s)`);

  for (const event of releasedRelevant) {
    const key = eventKey(event);
    const already = await getJSON(key);
    if (already) continue; // a signal has already been sent for this event

    const result = analyzeEvent(event);
    if (!result) {
      // No matching rule or couldn't compute a surprise — mark it as
      // "seen" anyway so we don't keep re-checking it.
      await setJSON(key, { notified: false, reason: "no_rule_or_data" });
      continue;
    }

    const pairSignals = toPairSignals(result);
    if (pairSignals.length === 0) {
      await setJSON(key, { notified: false, reason: "no_watched_pair" });
      continue;
    }

    const message = formatSignalMessage(event, pairSignals);
    await sendMessage(message);

    // The Mini App's News tab reads this record (via the Vercel API —
    // see lib/appData.js for details)
    const primarySignal = pairSignals.find((s) => s.pair === "XAUUSD") || pairSignals[0];
    await publishNewsItem(event, primarySignal ? { direction: primarySignal.direction === "bullish" ? "bull" : "bear", confidence: primarySignal.confidence } : null);

    // Save state for the follow-up: used to send a "why did it move
    // that way" analysis a couple of hours later
    await setJSON(key, {
      notified: true,
      event,
      pairSignals,
      notifiedAt: new Date().toISOString(),
      followupDone: false,
    });

    console.log(`Signal sent: ${event.event} (${event.currency})`);
  }
}

main().catch((err) => {
  console.error("monitor.js error:", err);
  process.exit(1);
});
