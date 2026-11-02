const fetch = require("node-fetch");

const FINANCE_CALENDAR_URL =
  "https://www.financecalendar.com/wp-json/fc/v1";

const FINNHUB_URL = "https://finnhub.io/api/v1";

// Finance Calendar country code → currency code
const COUNTRY_CURRENCY = {
  US: "USD",
  GB: "GBP",
  EU: "EUR",
  AU: "AUD",
  NZ: "NZD",
  JP: "JPY",
  CA: "CAD",
  CH: "CHF"
};

async function getEconomicCalendar(from, to) {
  const apiKey = process.env.FINANCECALENDAR_API_KEY;

  if (!apiKey) {
    throw new Error("FINANCECALENDAR_API_KEY is not set");
  }

  if (!from || !to) {
    throw new Error("Calendar from and to dates are required");
  }

  const params = new URLSearchParams({
    from,
    to,
    country: "US,GB,EU,AU,NZ,JP,CA",
    impact: "high",
    limit: "100"
  });

  const url = `${FINANCE_CALENDAR_URL}/calendar?${params}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json"
    },
    timeout: 30000
  });

  if (!res.ok) {
    throw new Error(
      `Finance Calendar error: ${res.status} ${await res.text()}`
    );
  }

  const data = await res.json();

  if (!Array.isArray(data.events)) {
    throw new Error("Finance Calendar returned an invalid events response");
  }

  return data.events.map((event) => {
    const country = String(event.country || "").toUpperCase();

    return {
      ...event,

      currency: event.currency || COUNTRY_CURRENCY[country] || null,

      event:
        event.title ||
        event.series_name ||
        event.name ||
        "Economic Event",

      time:
        event.release_at_utc ||
        event.time_utc ||
        event.date ||
        "",

      actual: event.actual ?? null,

      // Consensus is the forecast. Do not replace it with prior.
      estimate: event.consensus ?? null,

      // Previous period's value
      prev: event.prior ?? null
    };
  });
}

async function getForexQuote(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    throw new Error("FINNHUB_API_KEY is not set");
  }

  const params = new URLSearchParams({
    symbol,
    token: apiKey
  });

  const url = `${FINNHUB_URL}/quote?${params}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Finnhub quote error: ${res.status} ${await res.text()}`
    );
  }

  return res.json();
}

module.exports = {
  getEconomicCalendar,
  getForexQuote
};
