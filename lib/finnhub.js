
const API_URL = "https://www.financecalendar.com/wp-json/fc/v1/calendar";

async function getEconomicCalendar() {
  const apiKey = process.env.FINANCECALENDAR_API_KEY;

  if (!apiKey) {
    throw new Error("FINANCECALENDAR_API_KEY is missing");
  }

  const url = new URL(API_URL);
  url.searchParams.set("country", "US,GB,EU");
  url.searchParams.set("impact", "high");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Finance Calendar error: ${response.status} ${errorText}`
    );
  }

  const data = await response.json();

  return (data.events || []).map(event => ({
    title: event.series_name || event.title || event.name || "Economic Event",
    country: event.country || "",
    date: event.date || event.datetime || event.release_date || "",
    impact: event.impact || "high",
    actual: event.actual ?? null,
    forecast: event.consensus ?? event.forecast ?? null,
    previous: event.previous ?? null
  }));
}

module.exports = {
  getEconomicCalendar
};
