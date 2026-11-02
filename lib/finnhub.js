// lib/finnhub.js
// Fetches economic calendar data (aggregated from official sources like
// the BLS, RBA, BOE, etc.) through Finnhub. Finnhub aggregates these
// figures from official statistical agencies; it isn't an "official
// site" itself, but the actual/estimate/prev values come from official
// releases.
//
// Free API key: https://finnhub.io/register

const fetch = require("node-fetch");

const BASE_URL = "https://finnhub.io/api/v1";

/**
 * Returns economic calendar events within the given date range.
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 */
async function getEconomicCalendar(from, to) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY is not set");

  const url = `${BASE_URL}/calendar/economic?from=${from}&to=${to}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub calendar error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.economicCalendar || [];
}

/**
 * Gets the current quote for a forex pair (a simple quote, nothing fancy).
 * Finnhub forex quote: OANDA symbol format (e.g. OANDA:XAU_USD)
 */
async function getForexQuote(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY is not set");

  const url = `${BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Finnhub quote error: ${res.status} ${await res.text()}`);
  }
  return res.json(); // { c: current, h, l, o, pc: previous close, t }
}

module.exports = { getEconomicCalendar, getForexQuote };
