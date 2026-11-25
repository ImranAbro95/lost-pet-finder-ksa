// Abuse protection shared by the site and the demo store.
// The database enforces the same rules (supabase/schema.sql, section 10); these checks just give a friendly message first.

export const LIMITS = { posts: 5, messages: 40, flags: 10 }; // per person, per 24 hours

// True when a public text contains something that looks like a phone number:
// a Saudi mobile (05xxxxxxxx, 5xxxxxxxx, +9665…, 009665…), a landline (011…), or an international number (+… / 00…).
// Dates, times, rewards and 15-digit microchip numbers are allowed.
// Arabic-Indic digits are understood, and spaces, dots, dashes or brackets between digits are ignored.
export function hasPhone(text) {
  if (!text) return false;
  let s = String(text).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x6F0));
  s = s.replace(/(\d)[\s.()-]+(?=\d)/g, "$1");
  return /(^|\D)((\+|00)?966|0)?5\d{8}(\D|$)|(\+|(^|\D)00)\d{9,14}(\D|$)|(^|\D)0[1-9]\d{7,9}(\D|$)/.test(s);
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
export const rowHasPhone = row => PUBLIC_TEXT_FIELDS.some(k => hasPhone(row[k]));
