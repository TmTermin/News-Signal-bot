// lib/news.js
// Optional: fetches headlines from NewsAPI.org to give the follow-up
// analysis extra context. If NEWSAPI_KEY isn't set, this function just
// returns an empty list and the bot still works fine (it just analyzes
// based on price action alone).

const fetch = require("node-fetch");

async function getRelatedHeadlines(query, fromISO) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) return [];

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    query
  )}&from=${fromISO}&sortBy=publishedAt&language=en&pageSize=5&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map((a) => ({
      title: a.title,
      source: a.source?.name,
      url: a.url,
    }));
  } catch (err) {
    console.error("NewsAPI error:", err.message);
    return [];
  }
}

module.exports = { getRelatedHeadlines };
