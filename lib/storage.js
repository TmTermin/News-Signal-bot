// lib/storage.js
// Since GitHub Actions runs in a fresh environment every time, we need
// external storage to remember which events a signal has already been
// sent for, and which ones are still waiting on a follow-up.
// Upstash Redis (free tier) is used for this: https://upstash.com

const fetch = require("node-fetch");

function baseUrl() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  if (!url) throw new Error("UPSTASH_REDIS_REST_URL is not set");
  return url;
}

function authHeader() {
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!token) throw new Error("UPSTASH_REDIS_REST_TOKEN is not set");
  return { Authorization: `Bearer ${token}` };
}

async function redisCommand(parts) {
  const path = parts.map(encodeURIComponent).join("/");
  const res = await fetch(`${baseUrl()}/${path}`, { headers: authHeader() });
  if (!res.ok) {
    throw new Error(`Upstash error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.result;
}

/** Stores JSON state for an event (with a 7-day expiry by default) */
async function setJSON(key, value, ttlSeconds = 60 * 60 * 24 * 7) {
  await redisCommand(["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)]);
}

async function getJSON(key) {
  const raw = await redisCommand(["GET", key]);
  return raw ? JSON.parse(raw) : null;
}

/** Finds all keys matching a pattern (e.g. "signal sent, follow-up pending") */
async function scanKeys(pattern) {
  // Upstash REST SCAN is cursor-based; this is a simplified implementation
  // (a single KEYS call) that's good enough for small projects.
  return redisCommand(["KEYS", pattern]);
}

module.exports = { setJSON, getJSON, scanKeys };
