// lib/analysis.js
//
// IMPORTANT: the "confidence score" here is NOT a scientific forecasting
// model. It's a simple rule-based calculation: the bigger the gap
// between the "actual" figure and the "forecast", the "stronger" the
// signal is marked. This is never a guaranteed outcome and should only
// ever be used as a supporting indicator.

// For each event type: whether a higher value is "bullish" (positive)
// or "bearish" (negative) for that currency.
// inverse: true means a higher value is actually negative for the
// currency (e.g. a higher unemployment rate is a bad signal).
const EVENT_RULES = [
  { match: /cash rate|interest rate|bank rate|official bank rate/i, inverse: false, weight: 1.0 },
  { match: /cpi|inflation/i, inverse: false, weight: 0.9 },
  { match: /ppi|producer price/i, inverse: false, weight: 0.6 },
  { match: /non-farm|nfp|employment change|payrolls/i, inverse: false, weight: 0.95 },
  { match: /unemployment rate/i, inverse: true, weight: 0.85 },
  { match: /gdp/i, inverse: false, weight: 0.9 },
  { match: /retail sales/i, inverse: false, weight: 0.6 },
  { match: /average hourly earnings/i, inverse: false, weight: 0.5 },
  { match: /pmi/i, inverse: false, weight: 0.5 },
];

function findRule(eventName) {
  return EVENT_RULES.find((r) => r.match.test(eventName)) || null;
}

/**
 * Finance Calendar's actual/prior fields are strings that may carry a
 * unit suffix (e.g. "3.7%", "63K"). Strips that down to a plain number.
 */
function parseNumeric(value) {
  if (value == null) return null;
  if (typeof value === "number") return isNaN(value) ? null : value;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Computes the "surprise" (gap), normalized to the range -1..+1.
 *
 * IMPORTANT: Finance Calendar does not provide a forecast/consensus
 * value (that field is always null in their API). So instead of
 * comparing "actual vs forecast" (what analysts expected), this
 * compares "actual vs prior" (the same metric's previous reading) —
 * a weaker signal that only tells us the figure moved, not whether it
 * beat expectations.
 */
function computeSurprise(actual, prior) {
  const a = parseNumeric(actual);
  const p = parseNumeric(prior);
  if (a == null || p == null) return null;
  const diff = a - p;
  const scale = Math.max(Math.abs(p), 0.1); // avoid dividing by zero
  const normalized = diff / scale;
  return Math.max(-1, Math.min(1, normalized));
}

/**
 * Analyzes an event and returns a direction and confidence score
 * (0-100, heuristic only) for the currency.
 */
function analyzeEvent(event) {
  const rule = findRule(event.event || "");
  if (!rule) return null;

  const surprise = computeSurprise(event.actual, event.prev);
  if (surprise === null) return null;

  const effectiveSurprise = rule.inverse ? -surprise : surprise;
  const direction = effectiveSurprise > 0 ? "bullish" : effectiveSurprise < 0 ? "bearish" : "neutral";
  if (direction === "neutral") return null;

  // Heuristic confidence: magnitude of the surprise + the event's
  // importance weight. 50 = the cutoff threshold, 95 = the maximum
  // (never 100, as a reminder that this is never a guarantee).
  const magnitude = Math.min(Math.abs(effectiveSurprise), 1);
  const confidence = Math.round(50 + magnitude * rule.weight * 45);

  return {
    currency: event.currency,
    direction, // "bullish" | "bearish" — for THIS currency
    confidence: Math.min(confidence, 95),
    surprise: effectiveSurprise,
  };
}

// Which pairs we watch, and their base/quote currencies
const WATCHED_PAIRS = {
  XAUUSD: { base: "XAU", quote: "USD" },
  EURUSD: { base: "EUR", quote: "USD" },
  GBPUSD: { base: "GBP", quote: "USD" },
  AUDUSD: { base: "AUD", quote: "USD" },
  NZDUSD: { base: "NZD", quote: "USD" },
  USDJPY: { base: "USD", quote: "JPY" },
  USDCAD: { base: "USD", quote: "CAD" },
};

/**
 * Turns a currency-level bullish/bearish signal into a direction for
 * every watched pair that involves that currency.
 * For XAUUSD: USD bullish => XAUUSD bearish (gold typically gets
 * cheaper when the dollar strengthens).
 */
function toPairSignals(currencyResult) {
  const { currency, direction, confidence } = currencyResult;
  const signals = [];

  for (const [pair, { base, quote }] of Object.entries(WATCHED_PAIRS)) {
    if (base === currency) {
      signals.push({ pair, direction, confidence });
    } else if (quote === currency) {
      const inverted = direction === "bullish" ? "bearish" : "bullish";
      signals.push({ pair, direction: inverted, confidence });
    }
  }
  return signals;
}

module.exports = { analyzeEvent, toPairSignals, WATCHED_PAIRS };
