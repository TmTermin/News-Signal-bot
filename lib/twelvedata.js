// lib/twelvedata.js
//
// Shared helper for api/candles.js and api/price.js: tries
// TWELVEDATA_API_KEY first, and if that key is out of daily/minute
// credits, automatically retries the same request with
// TWELVEDATA_API_KEY_2. Add a second free Twelve Data account
// (https://twelvedata.com/register) to get a second key — this
// roughly doubles the effective daily budget (800 -> 1,600 requests).
//
// If TWELVEDATA_API_KEY_2 isn't set, this just uses the first key and
// behaves exactly as before.

export async function fetchTwelveData(path, params) {
  const keys = [process.env.TWELVEDATA_API_KEY, process.env.TWELVEDATA_API_KEY_2].filter(Boolean);
  if (keys.length === 0) {
    return { ok: false, status: 500, data: { error: 'Server not configured: missing TWELVEDATA_API_KEY' } };
  }

  let lastResult = null;
  for (let i = 0; i < keys.length; i++) {
    const qs = new URLSearchParams({ ...params, apikey: keys[i] }).toString();
    const url = `https://api.twelvedata.com/${path}?${qs}`;
    let res, data;
    try {
      res = await fetch(url);
      data = await res.json().catch(() => null);
    } catch (err) {
      lastResult = { ok: false, status: 500, data: { error: String(err) } };
      continue; // network hiccup — try the next key if there is one
    }

    const isRateLimited =
      res.status === 429 ||
      (data && (data.code === 429 || /run out of api credits|api credits/i.test(data.message || '')));

    if (!isRateLimited) {
      return { ok: res.ok, status: res.status, data };
    }
    lastResult = { ok: false, status: res.status, data };
  }
  return lastResult;
}
