// lib/financecalendar.js
// Fetches the economic calendar from Finance Calendar API
// (https://www.financecalendar.com/api/) — an alternative to Finnhub's
// /calendar/economic, which requires a paid plan. Finance Calendar's
// free tier includes 1,000 requests/day with a free account.
//
// IMPORTANT: unlike Finnhub, this API does NOT provide a forecast /
// consensus value — that field is always null here. We can only
// compare "actual" against "prior" (the same metric's previous
// reading), not against what analysts expected. See lib/analysis.js
// for how this changes the signal logic.
//
// Free account + key: https://www.financecalendar.com/account/?mode=register

const fetch = require("node-fetch");

const BASE_URL = "https://www.financecalendar.com/wp-json/fc/v1";

// Finance Calendar uses ISO country codes; our bot thinks in currencies.
const COUNTRY_TO_CURRENCY = {
  US: "USD", GB: "GBP", EU: "EUR", JP: "JPY",
  AU: "AUD", CA: "CAD", NZ: "NZD",
};

/**
 * Returns economic calendar events within the given date range, already
 * normalized to the shape the rest of the bot expects: { event, currency,
 * time, actual, prev, impact }. (No `estimate` field — see note above.)
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 */
async function getEconomicCalendar(from, to) {
  const apiKey = process.env.FINANCECALENDAR_API_KEY;
  if (!apiKey) throw new Error("FINANCECALENDAR_API_KEY is not set");

  // Note: the API's `category` filter only accepts a single value, not a
  // comma-separated list, so we fetch everything (indicators, central
  // bank decisions, holidays) and simply don't surface the holiday ones
  // (findRule() in lib/analysis.js won't match them anyway).
  const url = `${BASE_URL}/calendar?from=${from}&to=${to}&limit=500`;
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (!res.ok) {
    throw new Error(`Finance Calendar error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const events = data.events || [];

  return events
    .filter((e) => COUNTRY_TO_CURRENCY[e.country]) // only currencies we watch
    .map((e) => ({
      event: e.name || e.title,
      currency: COUNTRY_TO_CURRENCY[e.country],
      time: e.release_at_utc || e.date, // ISO datetime when known, else just a date
      actual: e.actual,
      prev: e.prior,
      impact: e.impact || "low",
    }));
}

module.exports = { getEconomicCalendar };
