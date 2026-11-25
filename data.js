import { LIMITS, limitError, phoneError, rowHasPhone } from "./guard.js";
// Data layer. Two stores with the same methods:
//  - SupabaseStore: the real, shared database (when config.js has the Supabase keys)
//  - DemoStore: saves everything in this browser only, so the site can be tried before going live.

const SUPABASE_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

export async function openStore(cfg) {
  if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
    const store = new SupabaseStore(cfg);
    await store.init();
    return store;
  }
  const demo = new DemoStore();
  await demo.init();
  return demo;
}

/* ---------------- Supabase ---------------- */
class SupabaseStore {
  constructor(cfg) { this.cfg = cfg; this.demo = false; this.uid = null; }

  async init() {
    const { createClient } = await import(SUPABASE_ESM);
    // PKCE flow: Google sends people back with ?code=... in the query string, which does not clash with the
    // site's #page addresses (the older token-in-#hash flow did, and sign-in was silently lost).
    this.sb = createClient(this.cfg.supabaseUrl, this.cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" }
    });
    const q = new URLSearchParams(location.search);
    this.authError = q.get("error_description") || q.get("error") || null;
    const returning = q.has("code") || !!this.authError;
    const { data } = await this.sb.auth.getSession();
    if (data && data.session) { this.uid = data.session.user.id; this.email = data.session.user.email || null; }
    this.justSignedIn = returning && !!this.uid;
    if (returning) { try { history.replaceState(null, "", location.pathname + (location.hash || "")); } catch (e) { /* optional */ } }
  }

  // Browsing is open to everyone; posting, messaging and marking need a signed-in account.
  async ensureUser() {
    if (this.uid) return this.uid;
    throw loginError();
  }

  async signInGoogle(returnHash) {
    const { error } = await this.sb.auth.signInWithOAuth({ provider: "google",
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } } });
    if (error) throw error;
  }
  async signOut() { await this.sb.auth.signOut(); this.uid = null; this.email = null; this._profile = null; }

  async getProfile(force) {
    if (!this.uid) return null;
    if (this._profile && !force) return this._profile;
    const { data } = await this.sb.from("profiles").select("*").eq("user_id", this.uid).maybeSingle();
    this._profile = data || null;
    return this._profile;
  }
  async acceptPrivacy(version, adult) {
    const { error } = await this.sb.rpc("accept_privacy", { notice_version: version, adult });
    if (error) throw error;
    return this.getProfile(true);
  }
  async myConsents() {
    const { data } = await this.sb.from("consents").select("purpose,version,given_at,withdrawn_at").order("given_at", { ascending: false });
    return data || [];
  }
  async addConsent(purpose) {
    const { error } = await this.sb.from("consents").insert({ user_id: this.uid, purpose, version: "post" });
    if (error) throw error;
  }
  async logPrivacy(action, detail) { try { await this.sb.rpc("log_privacy", { act: action, info: detail || null }); } catch (e) { /* best effort */ } }

  // PDPL right to a copy: everything we hold about this person, as one JSON file.
  async exportMyData() {
    const q = (tbl, sel = "*") => this.sb.from(tbl).select(sel);
    const [profile, consents, cases, messages, marks] = await Promise.all([
      q("profiles").eq("user_id", this.uid).maybeSingle(), q("consents"), q("cases").eq("owner_id", this.uid), q("messages"), q("marks")]);
    await this.logPrivacy("export");
    return { exported_at: new Date().toISOString(), account: { id: this.uid, email: this.email },
      profile: profile.data, consents: consents.data, posts: cases.data, messages: messages.data, match_marks: marks.data };
  }
  async _removeMyPhotos(urls) {
    const marker = "/pet-photos/";
    const paths = (urls || []).map(u => { const i = String(u).indexOf(marker); return i >= 0 ? decodeURIComponent(u.slice(i + marker.length)) : null; })
      .filter(p => p && p.startsWith(this.uid + "/"));
    if (paths.length) await this.sb.storage.from("pet-photos").remove(paths);
  }
  // PDPL right to destruction: photos first (files), then the account and everything linked to it.
  async deleteMyAccount() {
    const { data: files } = await this.sb.storage.from("pet-photos").list(this.uid, { limit: 1000 });
    if (files && files.length) await this.sb.storage.from("pet-photos").remove(files.map(f => `${this.uid}/${f.name}`));
    const { error } = await this.sb.rpc("delete_my_account");
    if (error) throw error;
    await this.signOut();
  }

  /* ---- admin (allowed only for profiles with is_admin = true, enforced by the database) ---- */
  async listFlags() {
    const { data, error } = await this.sb.from("flags").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data || [];
  }
  async clearFlag(id) { await this.sb.from("flags").delete().eq("id", id); }
  async listHidden() {
    const { data } = await this.sb.from("cases").select("*").eq("status", "hidden").order("created_at", { ascending: false }).limit(200);
    return data || [];
  }
  async setBlocked(userId, blocked) {
    const { error } = await this.sb.from("profiles").update({ blocked }).eq("user_id", userId);
    if (error) throw error;
  }

  async listCases({ kind, species, city, limit = 300 } = {}) {
    let q = this.sb.from("cases").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(limit);
    if (kind) q = q.eq("kind", kind);
    if (species) q = q.eq("species", species);
    if (city) q = q.eq("city", city);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async countReunited() {
    const { count, error } = await this.sb.from("cases").select("id", { count: "exact", head: true }).eq("status", "reunited");
    return error ? 0 : (count || 0);
  }

  async getCase(id) {
    const { data, error } = await this.sb.from("cases").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async myCases() {
    if (!this.uid) return [];
    const { data, error } = await this.sb.from("cases").select("*").eq("owner_id", this.uid).order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async uploadPhoto(blob) {
    const uid = await this.ensureUser();
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    const { error } = await this.sb.storage.from("pet-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return this.sb.storage.from("pet-photos").getPublicUrl(path).data.publicUrl;
  }

  // How many posts I made in the last 24 hours (the database allows LIMITS.posts).
  async postsToday() {
    if (!this.uid) return 0;
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await this.sb.from("cases").select("id", { count: "exact", head: true }).eq("owner_id", this.uid).gte("created_at", since);
    return count || 0;
  }
  async removePhotos(urls) { try { await this._removeMyPhotos(urls); } catch (e) { /* the monthly clean-up removes leftovers */ } }

  async createCase(row) {
    await this.ensureUser();
    const { data, error } = await this.sb.from("cases").insert(row).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async updateCase(id, patch) {
    const { error } = await this.sb.from("cases").update(patch).eq("id", id);
    if (error) throw error;
  }

  async deleteCase(id) {
    const c = await this.getCase(id);
    if (c && c.owner_id === this.uid) { try { await this._removeMyPhotos(c.photos); } catch (e) { /* files are also cleaned by the admin tool */ } }
    const { error } = await this.sb.from("cases").delete().eq("id", id);
    if (error) throw error;
    await this.logPrivacy("delete_post", id);
  }

  async getMarks(caseId) {
    if (!this.uid) return {};
    const { data, error } = await this.sb.from("marks").select("other_id,state").eq("case_id", caseId);
    if (error) throw error;
    const out = {};
    (data || []).forEach(m => { out[m.other_id] = m.state; });
    return out;
  }

  async setMark(caseId, otherId, state) {
    const uid = await this.ensureUser();
    if (!state) {
      const { error } = await this.sb.from("marks").delete().match({ owner_id: uid, case_id: caseId, other_id: otherId });
      if (error) throw error;
      return;
    }
    const { error } = await this.sb.from("marks").upsert(
      { owner_id: uid, case_id: caseId, other_id: otherId, state, updated_at: new Date().toISOString() },
      { onConflict: "owner_id,case_id,other_id" });
    if (error) throw error;
  }

  async externalLeads(caseId) {
    if (!this.uid) return [];
    const { data, error } = await this.sb.from("external_leads").select("*").eq("case_id", caseId).order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  async sendMessage(caseId, toId, body) {
    await this.ensureUser();
    const { error } = await this.sb.from("messages").insert({ case_id: caseId, to_id: toId, body });
    if (error) throw error;
  }

  async myMessages() {
    if (!this.uid) return [];
    const { data, error } = await this.sb.from("messages").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    return data || [];
  }

  /* ---- photo fingerprints (AI matching) ---- */
  async getVectors(caseId) {
    const { data, error } = await this.sb.from("photo_vectors").select("photo_index,crop,model,v").eq("case_id", caseId).limit(200);
    if (error) return [];
    return (data || []).map(r => ({ ...r, v: typeof r.v === "string" ? JSON.parse(r.v) : r.v }));
  }

  async saveVectors(theCase, rows) {
    if (!rows.length) return;
    const body = rows.map(r => ({ case_id: theCase.id, kind: theCase.kind, species: theCase.species, photo_index: r.photo_index,
      crop: r.crop, model: r.model, v: "[" + r.v.join(",") + "]" }));
    const { error } = await this.sb.from("photo_vectors").upsert(body, { onConflict: "case_id,photo_index,crop,model" });
    if (error) throw error;
  }

  // Best similarity per case of the wanted kind, for fingerprints of one model.
  async searchVectors(vectors, wantKind, species, model) {
    const best = {};
    for (const r of vectors.slice(0, 8)) {
      const { data, error } = await this.sb.rpc("match_photos", { query: "[" + r.v.join(",") + "]", want_kind: wantKind, want_species: species, model_name: model, max_results: 25 });
      if (error) continue;
      (data || []).forEach(x => { if (!(best[x.case_id] >= x.similarity)) best[x.case_id] = x.similarity; });
    }
    return best;
  }

  async flag(caseId, reason) {
    await this.ensureUser();
    const { error } = await this.sb.from("flags").insert({ case_id: caseId, reason });
    if (error) throw error;
  }

}

function loginError() { const e = new Error("Sign in first"); e.code = "login"; return e; }

/* ---------------- Demo (this browser only) ---------------- */
const KEY = "lpf-demo-v1";

class DemoStore {
  constructor() { this.demo = true; this.uid = null; this.email = null; }

  async init() {
    try { this.uid = localStorage.getItem("lpf-demo-user"); } catch (e) { this.uid = null; }
    this.email = this.uid ? "demo.user@gmail.com" : null;
    this.db = this._load();
    if (!this.db) {
      this.db = { cases: exampleCases(), marks: {}, messages: [], flags: [] };
      this._save();
    }
  }
  _load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  _save() { try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch (e) { /* storage full or blocked: keep in memory */ } }

  async ensureUser() { if (this.uid) return this.uid; throw loginError(); }
  async signInGoogle() { this.uid = "demo-me"; this.email = "demo.user@gmail.com"; try { localStorage.setItem("lpf-demo-user", this.uid); } catch (e) { /* optional */ } }
  async signOut() { this.uid = null; this.email = null; try { localStorage.removeItem("lpf-demo-user"); } catch (e) { /* optional */ } }
  async getProfile() { return this.uid ? (this.db.profile || null) : null; }
  async acceptPrivacy(version, adult) {
    if (!adult) throw new Error("adult");
    const at = new Date().toISOString();
    this.db.profile = { user_id: this.uid, privacy_version: version, accepted_at: at, is_adult: true, is_admin: true, blocked: false };
    this.db.consents = (this.db.consents || []).concat(["privacy_notice", "terms", "adult"].map(p => ({ purpose: p, version, given_at: at, withdrawn_at: null })));
    this._save(); return this.db.profile;
  }
  async myConsents() { return (this.db.consents || []).slice().reverse(); }
  async addConsent(purpose) { this.db.consents = (this.db.consents || []).concat([{ purpose, version: "post", given_at: new Date().toISOString(), withdrawn_at: null }]); this._save(); }
  async logPrivacy() { /* demo: nothing to log */ }
  async exportMyData() {
    return { exported_at: new Date().toISOString(), account: { id: this.uid, email: this.email }, profile: this.db.profile || null,
      consents: this.db.consents || [], posts: this.db.cases.filter(c => c.owner_id === this.uid), messages: this.db.messages, match_marks: this.db.marks };
  }
  async deleteMyAccount() {
    this.db.cases = this.db.cases.filter(c => c.owner_id !== this.uid);
    this.db.messages = []; this.db.marks = {}; this.db.profile = null; this.db.consents = []; this.db.vectors = {};
    this._save(); await this.signOut();
  }
  async listFlags() { return (this.db.flags || []).map((f, i) => ({ id: i, created_at: f.created_at || new Date().toISOString(), ...f })); }
  async clearFlag(id) { this.db.flags.splice(id, 1); this._save(); }
  async listHidden() { return this.db.cases.filter(c => c.status === "hidden"); }
  async setBlocked() { /* demo: nothing to block */ }

  async listCases({ kind, species, city, limit = 300 } = {}) {
    return this.db.cases
      .filter(c => c.status === "open" && (!kind || c.kind === kind) && (!species || c.species === species) && (!city || c.city === city))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
  }
  async countReunited() { return this.db.cases.filter(c => c.status === "reunited").length; }
  async getCase(id) { const c = this.db.cases.find(x => x.id === id); return c && (c.status !== "hidden" || c.owner_id === this.uid || (this.db.profile || {}).is_admin) ? c : null; }
  async myCases() { if (!this.uid) return []; return this.db.cases.filter(c => c.owner_id === this.uid).sort((a, b) => b.created_at.localeCompare(a.created_at)); }

  async uploadPhoto(blob) {
    // Demo keeps small photos inside the browser as data URLs.
    const small = await shrink(blob, 560, 0.72);
    return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(small); });
  }
  async postsToday() { const since = new Date(Date.now() - 864e5).toISOString(); return this.db.cases.filter(c => c.owner_id === this.uid && c.created_at > since).length; }
  async removePhotos() { /* demo photos live inside the post */ }
  async createCase(row) {
    await this.ensureUser();
    if (rowHasPhone(row)) throw phoneError();
    if (await this.postsToday() >= LIMITS.posts) throw limitError("posts");
    const id = "d" + Math.random().toString(36).slice(2, 10);
    this.db.cases.push({ ...row, id, owner_id: this.uid, status: "open", created_at: new Date().toISOString() });
    this._save();
    return id;
  }
  async updateCase(id, patch) { if (rowHasPhone(patch)) throw phoneError(); const c = this.db.cases.find(x => x.id === id); if (c) Object.assign(c, patch); this._save(); }
  async deleteCase(id) { this.db.cases = this.db.cases.filter(c => c.id !== id); this._save(); }
  async getMarks(caseId) { return { ...(this.db.marks[caseId] || {}) }; }
  async setMark(caseId, otherId, state) {
    await this.ensureUser();
    const m = this.db.marks[caseId] || (this.db.marks[caseId] = {});
    if (state) m[otherId] = state; else delete m[otherId];
    this._save();
  }
  async externalLeads() { return []; }
  async sendMessage(caseId, toId, body) {
    await this.ensureUser();
    const since = new Date(Date.now() - 864e5).toISOString();
    if (this.db.messages.filter(m => m.from_id === this.uid && m.created_at > since).length >= LIMITS.messages) throw limitError("messages");
    this.db.messages.push({ id: "m" + Date.now(), case_id: caseId, from_id: this.uid, to_id: toId, body, created_at: new Date().toISOString() });
    this._save();
  }
  async myMessages() { return this.db.messages.filter(m => m.from_id === this.uid || m.to_id === this.uid).slice().reverse(); }
  async getVectors(caseId) { return ((this.db.vectors || {})[caseId] || []).slice(); }
  async saveVectors(theCase, rows) {
    this.db.vectors = this.db.vectors || {};
    const list = this.db.vectors[theCase.id] || (this.db.vectors[theCase.id] = []);
    rows.forEach(r => { const i = list.findIndex(x => x.model === r.model && x.photo_index === r.photo_index && x.crop === r.crop); if (i >= 0) list[i] = r; else list.push(r); });
    this._save();
  }
  async searchVectors(vectors, wantKind, species, model) {
    const best = {};
    const cases = this.db.cases.filter(c => c.status === "open" && c.kind === wantKind && c.species === species);
    for (const c of cases) for (const o of ((this.db.vectors || {})[c.id] || [])) {
      if (o.model !== model) continue;
      for (const q of vectors) {
        if (q.v.length !== o.v.length) continue;
        let s = 0; for (let i = 0; i < q.v.length; i++) s += q.v[i] * o.v[i];
        if (!(best[c.id] >= s)) best[c.id] = s;
      }
    }
    return best;
  }
  async flag(caseId, reason) {
    await this.ensureUser();
    const since = new Date(Date.now() - 864e5).toISOString();
    if (this.db.flags.filter(f => f.reporter_id === this.uid && f.created_at > since).length >= LIMITS.flags) throw limitError("reports");
    this.db.flags.push({ case_id: caseId, reason, reporter_id: this.uid, created_at: new Date().toISOString() }); this._save(); }

}

// Example posts so the demo is not empty. Clearly marked as examples on screen.
function exampleCases() {
  const now = Date.now(), day = 864e5;
  const iso = d => new Date(now - d * day).toISOString();
  const date = d => iso(d).slice(0, 10);
  const base = { owner_id: "example", status: "open", example: true, photos: [], public_whatsapp: null };
  return [
    { ...base, id: "ex1", kind: "lost", species: "cat", pet_name: "Example: Luna", breed: "Persian", sex: "female", age_group: "adult",
      colors: "white long hair", eye_color: "yellow", markings: "pink collar", description: "Example post to show how a lost report looks.",
      city: "riyadh", district: "Al Yasmin", lat: 24.826, lng: 46.640, event_date: date(4), created_at: iso(4), reward: "500 SAR" },
    { ...base, id: "ex2", kind: "found", species: "cat", pet_name: null, breed: "Himalayan", sex: "male", age_group: "adult",
      colors: "cream body, grey-brown face and paws", eye_color: "blue", markings: "stripes on forehead, bushy tail",
      description: "Example post: friendly indoor cat found near a mosque, now staying with me.",
      city: "riyadh", district: "Hittin", lat: 24.763, lng: 46.603, event_date: date(2), created_at: iso(2), reward: null },
    { ...base, id: "ex3", kind: "found", species: "dog", pet_name: null, breed: "", sex: "unknown", age_group: "young",
      colors: "brown and white", eye_color: "brown", markings: "red collar", description: "Example post: young dog seen near the park.",
      city: "jeddah", district: "Al Rawdah", lat: 21.565, lng: 39.155, event_date: date(1), created_at: iso(1), reward: null }
  ];
}

// Resize an image file in the browser before upload (keeps photos small and quick on mobile data).
export async function shrink(file, maxSide = 1280, quality = 0.8) {
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch (e) {
    bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w = bmp.width, h = bmp.height, k = Math.min(1, maxSide / Math.max(w, h));
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return await new Promise(res => cv.toBlob(res, "image/jpeg", quality));
}
