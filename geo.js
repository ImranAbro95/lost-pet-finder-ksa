// Address search and "use my location" for the report form.
// Uses OpenStreetMap's free Nominatim service: only the words typed (or the map point) are sent, never who is asking.
// Nominatim's fair-use policy: at most 1 request per second and no search-as-you-type, so we search only when the
// person presses "Find" and space requests at least 1.1 seconds apart.

const BASE = "https://nominatim.openstreetmap.org";
let last = 0;
async function politeFetch(url) {
  const wait = Math.max(0, last + 1100 - Date.now());
  if (wait) await new Promise(r => setTimeout(r, wait));
  last = Date.now();
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("geo " + r.status);
  return r.json();
}

function parse(item) {
  const a = item.address || {};
  return {
    label: item.display_name || "",
    lat: +(+item.lat).toFixed(5),
    lng: +(+(item.lon ?? item.lng)).toFixed(5),
    district: a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || "",
    cityName: a.city || a.town || a.village || a.county || a.state || "",
  };
}

// Search a typed address or place inside Saudi Arabia. Returns up to 5 places.
export async function searchPlaces(q, lang) {
  const text = String(q || "").trim();
  if (text.length < 2) return [];
  const url = `${BASE}/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=sa&accept-language=${lang === "ar" ? "ar,en" : "en,ar"}&q=${encodeURIComponent(text)}`;
  const data = await politeFetch(url);
  return (Array.isArray(data) ? data : []).map(parse).filter(p => isFinite(p.lat) && isFinite(p.lng));
}

// Area name for a map point (used after tapping the map or "use my location").
export async function reversePlace(lat, lng, lang) {
  const url = `${BASE}/reverse?format=jsonv2&addressdetails=1&zoom=16&accept-language=${lang === "ar" ? "ar,en" : "en,ar"}&lat=${lat}&lon=${lng}`;
  const data = await politeFetch(url);
  return data && !data.error ? parse(data) : null;
}

// Find our city id from a place's city name (English or Arabic).
const norm = s => String(s || "").toLowerCase().replace(/^al[\s-]/, "").replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}]+/gu, "");
export function matchCity(cityName, cities) {
  const n = norm(cityName);
  if (!n) return null;
  const hit = cities.find(c => c.id !== "other" && [c.en, c.ar, c.id].some(x => { const m = norm(x); return m && (n.includes(m) || m.includes(n)); }));
  return hit ? hit.id : null;
}

// The browser's own location (asks the person first). Resolves {lat, lng} or rejects.
export function myLocation() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }),
      e => rej(e), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}
