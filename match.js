// Matching: scores how likely a found report is the same animal as a lost report (0-100).
// Simple, explainable rules; photos are always checked by people.

const COLOR_WORDS = {
  cream: ["cream", "creamy", "beige", "ivory", "كريمي", "كريم", "بيج", "عاجي"],
  white: ["white", "ابيض", "أبيض", "بيضاء", "بيضا"],
  black: ["black", "اسود", "أسود", "سوداء", "سودا"],
  grey: ["grey", "gray", "silver", "blue-grey", "رمادي", "رماديه", "رمادية", "فضي"],
  brown: ["brown", "chocolate", "بني", "بنية", "شوكولاتة"],
  orange: ["orange", "ginger", "red", "برتقالي", "اشقر", "أشقر", "احمر", "أحمر"],
  tabby: ["tabby", "striped", "stripes", "lynx", "مخطط", "خطوط", "تابي", "نمر"],
  point: ["point", "colourpoint", "colorpoint", "seal", "himalayan", "siamese", "هملايا", "همالايا", "سيامي"],
  calico: ["calico", "tortie", "tortoiseshell", "three colours", "ثلاثي", "ثلاث الوان"],
  golden: ["golden", "gold", "ذهبي"]
};
const EYE_WORDS = {
  blue: ["blue", "ازرق", "أزرق", "زرقاء", "زرق"],
  green: ["green", "اخضر", "أخضر", "خضراء"],
  yellow: ["yellow", "amber", "gold", "copper", "orange", "اصفر", "أصفر", "عسلي", "ذهبي", "نحاسي"],
  brown: ["brown", "بني"],
  odd: ["odd", "two colours", "different", "مختلفة"]
};
const BREED_GROUPS = [
  ["persian", "himalayan", "shirazi", "exotic", "peke", "شيرازي", "هملايا", "همالايا", "فارسي"],
  ["scottish", "fold", "straight", "سكوتش", "سكوتش فولد", "سكوتش ستريت"],
  ["british", "بريتش", "بريطاني"],
  ["siamese", "سيامي"],
  ["ragdoll", "راغدول", "رادغول"],
  ["maine", "coon", "ماين كون"],
  ["husky", "هاسكي"], ["german shepherd", "جيرمن", "شيبرد"], ["golden retriever", "retriever", "جولدن"], ["pomeranian", "بومرينيان"], ["shih", "شيتزو"]
];

const norm = s => String(s || "").toLowerCase().replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

function tags(text, dict) {
  const t = norm(text), out = new Set();
  for (const [k, words] of Object.entries(dict)) if (words.some(w => t.includes(norm(w)))) out.add(k);
  return out;
}
function breedGroup(text) {
  const t = norm(text);
  for (let i = 0; i < BREED_GROUPS.length; i++) if (BREED_GROUPS.at(i).some(w => t.includes(norm(w)))) return i;
  return -1;
}

export function distanceKm(a, b) {
  if (a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null;
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// lost = the lost report, found = the found report. Returns {score, reasons[]} or null when impossible.
export function scoreMatch(lost, found) {
  if (!lost || !found || lost.species !== found.species) return null;
  const reasons = [];
  let s = 0;

  // A pet cannot be found before it was lost (one day of slack for time zones and memory).
  const dl = Date.parse(lost.event_date), df = Date.parse(found.event_date);
  if (!isNaN(dl) && !isNaN(df)) {
    const days = (df - dl) / 864e5;
    if (days < -1) return null;
    if (days <= 14) { s += 10; reasons.push("date"); } else if (days <= 60) s += 4;
  }

  // Place.
  const km = distanceKm(lost, found);
  const sameDistrict = lost.district && found.district && norm(lost.district) === norm(found.district);
  if (km != null) {
    const p = km < 2 ? 30 : km < 5 ? 25 : km < 10 ? 18 : km < 25 ? 10 : km < 60 ? 4 : 0;
    s += p; if (p >= 18) reasons.push("near");
  } else if (sameDistrict) { s += 22; reasons.push("near"); }
  else if (lost.city && lost.city === found.city) { s += 8; }

  // Colours (from colours, marks and breed text together).
  const lc = tags([lost.colors, lost.markings, lost.breed].join(" "), COLOR_WORDS);
  const fc = tags([found.colors, found.markings, found.breed].join(" "), COLOR_WORDS);
  if (lc.size && fc.size) {
    let shared = 0; lc.forEach(c => { if (fc.has(c)) shared++; });
    const j = shared / (lc.size + fc.size - shared);
    s += Math.round(j * 28); if (j >= 0.5) reasons.push("colour");
    if (shared === 0) s -= 10;
  }

  // Eyes.
  const le = tags(lost.eye_color, EYE_WORDS), fe = tags(found.eye_color, EYE_WORDS);
  if (le.size && fe.size) {
    let same = false; le.forEach(e => { if (fe.has(e)) same = true; });
    if (same) { s += 12; reasons.push("eyes"); } else s -= 12;
  }

  // Sex.
  if (lost.sex !== "unknown" && found.sex !== "unknown") {
    if (lost.sex === found.sex) s += 5; else s -= 15;
  }

  // Breed family.
  const lb = breedGroup(lost.breed), fb = breedGroup(found.breed);
  if (lb >= 0 && fb >= 0) { if (lb === fb) { s += 10; reasons.push("breed"); } else s -= 5; }

  return { score: Math.max(0, Math.min(100, s)), km, reasons };
}

// All candidates of the opposite kind for one case, best first.
export function rankMatches(theCase, candidates, minScore = 20) {
  const out = [];
  for (const other of candidates) {
    if (other.id === theCase.id || other.kind === theCase.kind) continue;
    const r = theCase.kind === "lost" ? scoreMatch(theCase, other) : scoreMatch(other, theCase);
    if (r && r.score >= minScore) out.push({ other, ...r });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}
