// Abuse protection shared by the site and the demo store.
// The database enforces the same rules (supabase/schema.sql, section 10); these checks just give a friendly message first.

export const LIMITS = { posts: 5, messages: 40, flags: 10 }; // per person, per 24 hours

// True when a public text contains something that looks like a phone number:
// a Saudi mobile (05xxxxxxxx, 5xxxxxxxx, +9665…, 009665…), a landline (011…), or an international number (+… / 00…).
// Dates, times, rewards and 15-digit microchip numbers are allowed (lesson L002).
// Tricks that are understood: Arabic-Indic, Persian and full-width digits; invisible (zero-width) characters;
// spaces, dots, dashes, brackets, _ / , * # – — between digits; number words in English and Arabic
// ("zero five five…", "صفر خمسة خمسة…"); and the letters O and l/I used for 0 and 1 next to digits.
// The same rules are in supabase/schema.sql (public.has_phone); keep both in step.
const NUM_WORDS = [
  ["zero|oh", "0"], ["one", "1"], ["two", "2"], ["three", "3"], ["four", "4"], ["five", "5"], ["six", "6"], ["seven", "7"], ["eight", "8"], ["nine", "9"],
  ["صفر", "0"], ["واحد|واحده", "1"], ["اثنين|اثنان|اثنتين|اثنتان", "2"], ["ثلاثه|ثلاث", "3"], ["اربعه|اربع", "4"], ["خمسه|خمس", "5"],
  ["سته|ست", "6"], ["سبعه|سبع", "7"], ["ثمانيه|ثماني|ثمان", "8"], ["تسعه|تسع", "9"]
];
export function phoneText(text) {
  let s = String(text).toLowerCase()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0))
    .replace(/[０-９]/g, d => String(d.charCodeAt(0) - 0xFF10))
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[إأآ]/g, "ا").replace(/ة/g, "ه");
  for (const [w, d] of NUM_WORDS) s = s.replace(new RegExp(`(^|[^a-z\u0600-\u06FF])(?:${w})(?=[^a-z\u0600-\u06FF]|$)`, "g"), `$1${d}`);
  for (let prev = ""; prev !== s;) { prev = s; s = s.replace(/(\d)o|o(?=\d)/g, (m, a) => (a || "") + "0").replace(/(\d)[il|]|[il|](?=\d)/g, (m, a) => (a || "") + "1"); }
  s = s.replace(/(^|\D)\d{1,4}[\/.-]\d{1,2}[\/.-]\d{2,4}(?!\d)/g, "$1 date ").replace(/(^|\D)\d{1,2}:\d{2}(?!\d)/g, "$1 time "); // dates and times
  return s.replace(/(\d)[\s.()_\/,*#–—-]+(?=\d)/g, "$1");
}
export function hasPhone(text) {
  if (!text) return false;
  return /(^|\D)((\+|00)?966|0)?5\d{8}(\D|$)|(\+|(^|\D)00)\d{9,14}(\D|$)|(^|\D)0[1-9]\d{7,9}(\D|$)/.test(phoneText(text));
}

export function limitError(what) { const e = new Error("rate_limit: " + what); e.code = "limit"; return e; }
export function phoneError() { const e = new Error("phone_in_text"); e.code = "phone"; return e; }

// Turn a database or demo error into "limit", "phone" or null.
export function errKind(e) {
  const m = String((e && (e.message || e.details || e.hint)) || "");
  if ((e && e.code === "limit") || m.includes("rate_limit")) return "limit";
  if ((e && e.code === "phone") || m.includes("phone_in_text")) return "phone";
  return null;
}

export const PUBLIC_TEXT_FIELDS = ["pet_name", "breed", "colors", "eye_color", "markings", "description", "district", "reward"];
// A number split across fields (breed "055", marks "123", description "4567") is caught by joining the digits at the
// start and end of each field, in order, and checking that. Digits in the middle of a text are not joined (fewer false alarms).
export function edgeDigits(text) {
  if (!text) return "";
  const s = phoneText(text).trim();
  if (/^\+?\d+$/.test(s)) return s;
  const lead = (s.match(/^\+?\d+/) || [""])[0], trail = (s.match(/\d+$/) || [""])[0];
  return [lead, trail].filter(Boolean).join(" ");
}
export const rowHasPhone = row => PUBLIC_TEXT_FIELDS.some(k => hasPhone(row[k])) || hasPhone(PUBLIC_TEXT_FIELDS.map(k => edgeDigits(row[k])).filter(Boolean).join(" "));
