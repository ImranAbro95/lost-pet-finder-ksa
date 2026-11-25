import { STRINGS, CITIES, RIYADH_DISTRICTS } from "./i18n.js";
import { openStore, shrink } from "./data.js";
import { scoreMatch } from "./match.js";
import { computeFingerprints, missingWork, photoMatchPct, BASIC_MODEL } from "./ai.js";
import { renderPoster, canvasBlob, SIZES } from "./poster.js";
import { icon, HERO_ART } from "./icons.js";
import { hasPhone, errKind, LIMITS } from "./guard.js";
import { NOTICE_VERSION, privacyHtml, termsHtml } from "./legal.js";
import { searchPlaces, reversePlace, matchCity, myLocation } from "./geo.js";

const cfg = window.LPF_CONFIG || {};
let store = null;
let lang = "en";
let activeMap = null;
const app = document.getElementById("app");

/* ---------- helpers ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const t = k => (STRINGS[lang] && STRINGS[lang][k] != null ? STRINGS[lang][k] : (STRINGS.en[k] != null ? STRINGS.en[k] : k));
const safeImg = u => typeof u === "string" && (u.startsWith("https://") || u.startsWith("data:image/")) ? u : null;
const city = id => CITIES.find(c => c.id === id) || CITIES.at(-1);
const cityLabel = id => city(id)[lang] || city(id).en;
const speciesWord = s => t(s) || s;
// Share links: on the live site /p/<id> (gives chat apps a photo preview, then opens the post); in the demo, #case-<id>.
const caseLink = id => {
  const site = cfg.siteUrl ? cfg.siteUrl.replace(/\/$/, "") : "";
  if (store && !store.demo && /^[0-9a-f-]{36}$/i.test(id)) return (site || location.origin) + "/p/" + id;
  return (site ? site + "/" : location.origin + location.pathname) + "#case-" + id;
};
const titleOf = c => c.pet_name || c.breed || speciesWord(c.species);
const today = () => new Date().toISOString().slice(0, 10);
const shortId = id => String(id || "").replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase();
const REASONS = { near: { en: "close by", ar: "قريب" }, colour: { en: "colours match", ar: "الألوان متطابقة" }, eyes: { en: "same eye colour", ar: "نفس لون العيون" }, breed: { en: "same breed family", ar: "نفس فصيلة السلالة" }, date: { en: "dates fit", ar: "التواريخ مناسبة" } };

// Friendly text for a failed save: daily limit, phone number in text, or a general error.
function errMsg(e) { const k = errKind(e); return k === "limit" ? t("errLimit") : k === "phone" ? t("errPhoneText") : t("errSave"); }

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("on");
  clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove("on"), 3200);
}
function setLang(l) {
  lang = l === "ar" ? "ar" : "en";
  try { localStorage.setItem("lpf-lang", lang); } catch (e) { /* optional */ }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
  document.getElementById("brandName").textContent = t("appName");
  document.getElementById("langBtn").textContent = t("lang");
  document.getElementById("safetyLine").textContent = t("safety");
  document.getElementById("privacyTitle").textContent = t("privacy") + ":";
  document.getElementById("privacyText").textContent = t("privacyText");
  document.title = t("appName");
  const sl = document.getElementById("sizeLabel"); if (sl) sl.textContent = t("textSize");
  const bar = document.getElementById("demoBar");
  bar.hidden = !(store && store.demo);
  bar.textContent = t("demoBanner");
}
function killMap() { if (activeMap) { try { activeMap.remove(); } catch (e) { /* ignore */ } activeMap = null; } }

function thumbHtml(c) {
  const src = safeImg((c.photos || [])[0]);
  return `<div class="thumb">${src ? `<img src="${esc(src)}" alt="${esc(titleOf(c))}" loading="lazy">` : `<div class="ph">${icon("paw")}<span>${esc(speciesWord(c.species))}</span></div>`}</div>`;
}
function pills(c) {
  const st = c.status !== "open" ? `<span class="pill reunited">${icon("heart")}${esc(t(c.status))}</span>` : `<span class="pill ${c.kind}">${esc(t(c.kind))}</span>`;
  return st + (c.example ? ` <span class="pill example">${esc(t("exampleTag"))}</span>` : "");
}
// "today", "3 days ago" in the page language (falls back to the date).
function ago(dateStr) {
  const d = Date.parse(dateStr); if (isNaN(d)) return dateStr || "";
  const days = Math.round((Date.parse(today()) - d) / 864e5);
  try { return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(-days, "day"); } catch (e) { return dateStr; }
}
function placeLine(c) { return [c.district, cityLabel(c.city)].filter(Boolean).join(lang === "ar" ? "، " : ", "); }
function cardHtml(c) {
  const label = `${t(c.kind)}: ${titleOf(c)}, ${placeLine(c)}, ${ago(c.event_date)}`;
  return `<a class="card" href="#case-${esc(c.id)}" aria-label="${esc(label)}">${thumbHtml(c)}
    <div class="badges">${pills(c)}</div>
    <div class="body">
    <div class="title">${esc(titleOf(c))}</div>
    <div class="meta">${icon("pin")}<span>${esc(placeLine(c))}</span></div>
    <div class="meta">${icon("clock")}<span>${esc(ago(c.event_date))}</span></div></div></a>`;
}
function emptyHtml(msg, ctaHref, ctaText, cls = "") {
  return `<div class="empty">${icon("paw")}<p>${esc(msg)}</p>${ctaHref ? `<a class="btn ${cls}" href="${ctaHref}">${esc(ctaText)}</a>` : ""}</div>`;
}

/* ---------- accounts, consent and PDPL rights ---------- */
const NEXT_KEY = "lpf-next";
function setNext(h) { try { sessionStorage.setItem(NEXT_KEY, h); } catch (e) { /* optional */ } }
function takeNext() { let h = null; try { h = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch (e) { /* optional */ } return h || "#home"; }

// Posting, messaging and marking need a signed-in adult who accepted the current privacy notice.
async function requireAccount(nextHash) {
  if (!store.uid) { setNext(nextHash); location.hash = "#signin"; return false; }
  const p = await store.getProfile();
  if (!p || !p.accepted_at || p.privacy_version !== NOTICE_VERSION || !p.is_adult) { setNext(nextHash); location.hash = "#consent"; return false; }
  if (p.blocked) { app.innerHTML = emptyHtml(t("blockedMsg")); return false; }
  return true;
}
function needLogin(e, nextHash) {
  if (e && e.code === "login") { setNext(nextHash); location.hash = "#signin"; return true; }
  return false;
}

function viewSignin() {
  if (store.uid) { location.hash = "#consent"; return; }
  app.innerHTML = `<div class="form-wrap"><div class="panel auth">
    ${icon("user", "ic auth-ic")}
    <h1>${esc(t("signinTitle"))}</h1>
    <p class="muted">${esc(t("signinWhy"))}</p>
    <button class="btn google" id="gBtn" type="button">${GOOGLE_G}<span>${esc(t("signinGoogle"))}</span></button>
    <p class="help"><b>${esc(t("signinNew"))}</b></p>
    <p class="help">${esc(t("signinBrowse"))}</p>
    <p class="help">${esc(t("signinPrivacyPre"))} <a href="#privacy">${esc(t("privacy"))}</a> · <a href="#terms">${esc(t("terms"))}</a></p>
  </div></div>`;
  document.getElementById("gBtn").onclick = async () => {
    const next = (() => { try { return sessionStorage.getItem(NEXT_KEY) || "#home"; } catch (e) { return "#home"; } })();
    try {
      await store.signInGoogle(next);
      if (store.demo) { location.hash = "#consent"; route(); }
    } catch (e) { console.error(e); toast(t("errSignin")); }
  };
}

async function viewConsent() {
  if (!store.uid) { location.hash = "#signin"; return; }
  const prof = await store.getProfile();
  const isNew = !prof || !prof.accepted_at;
  app.innerHTML = `<div class="form-wrap"><div class="panel stack">
    <h1>${esc(t(isNew ? "createTitle" : "consentTitle"))}</h1>
    <p class="muted">${esc(t("consentIntro"))}</p>
    <ul class="ticks">${t("consentPoints").split("|").map(x => `<li>${icon("check")}<span>${esc(x)}</span></li>`).join("")}</ul>
    <p><a href="#privacy" target="_blank" rel="noopener">${esc(t("readPrivacy"))}</a> · <a href="#terms" target="_blank" rel="noopener">${esc(t("readTerms"))}</a></p>
    <label class="check"><input type="checkbox" id="cPrivacy"><span>${esc(t("consentPrivacy"))}</span></label>
    <label class="check"><input type="checkbox" id="cTerms"><span>${esc(t("consentTerms"))}</span></label>
    <label class="check"><input type="checkbox" id="cAdult"><span>${esc(t("consentAdult"))}</span></label>
    <p class="err" id="cErr" role="alert" hidden></p>
    <div class="row"><button class="btn primary" id="cOk" type="button">${esc(t("consentAgree"))}</button><button class="btn" id="cNo" type="button">${esc(t("consentNo"))}</button></div>
  </div></div>`;
  document.getElementById("cOk").onclick = async () => {
    const ok = ["cPrivacy", "cTerms", "cAdult"].every(id => document.getElementById(id).checked);
    const err = document.getElementById("cErr");
    if (!ok) { err.textContent = t("consentNeedAll"); err.hidden = false; return; }
    try { await store.acceptPrivacy(NOTICE_VERSION, true); location.hash = takeNext(); }
    catch (e) { console.error(e); err.textContent = t("errSave"); err.hidden = false; }
  };
  document.getElementById("cNo").onclick = async () => { await store.signOut(); location.hash = "#home"; refreshHeader(); };
}

function viewLegal(which) {
  app.innerHTML = `<article class="legal-page"><h1>${esc(t(which === "privacy" ? "privacyTitle" : "termsTitle"))}</h1>
    ${which === "privacy" ? privacyHtml(lang, cfg) : termsHtml(lang)}</article>`;
}

async function viewAccount() {
  if (!store.uid) { setNext("#account"); location.hash = "#signin"; return; }
  const [p, consents] = await Promise.all([store.getProfile(), store.myConsents()]);
  const purpose = k => t("purpose_" + k) || k;
  app.innerHTML = `<div class="form-wrap stack">
    <h1>${esc(t("accountTitle"))}</h1>
    <div class="panel stack"><div class="row" style="justify-content:space-between"><div><b>${esc(t("signedInAs"))}</b><div class="muted"><bdi>${esc(store.email || "")}</bdi></div></div>
      <button class="btn sm" id="outBtn" type="button">${esc(t("signOut"))}</button></div>
      ${p && p.is_admin ? `<a class="btn sm" href="#admin">${icon("shield")}${esc(t("adminTitle"))}</a>` : ""}</div>
    <div class="panel stack"><h2>${esc(t("yourRights"))}</h2><p class="muted">${esc(t("yourRightsText"))}</p>
      <div class="row"><button class="btn" id="dlBtn" type="button">${icon("poster")}${esc(t("downloadData"))}</button>
      <a class="btn" href="#mine">${icon("paw")}${esc(t("editPosts"))}</a></div></div>
    <div class="panel stack"><h2>${esc(t("consentsTitle"))}</h2>
      ${consents.length ? `<ul class="consent-list">${consents.map(c => `<li>${icon("check")}<div><b>${esc(purpose(c.purpose))}</b>
        <div class="meta"><span><bdi>${esc((c.given_at || "").slice(0, 10))}</bdi>${c.version && c.version !== "post" ? ` · ${esc(t("consentVersion"))} <bdi>${esc(c.version)}</bdi>` : ""}</span></div></div></li>`).join("")}</ul>` : `<p class="muted">—</p>`}
      <p class="help">${esc(t("withdrawHelp"))}</p></div>
    <div class="panel stack danger"><h2>${esc(t("deleteAccountTitle"))}</h2><p class="muted">${esc(t("deleteAccountText"))}</p>
      <div><button class="btn lost" id="delAcc" type="button">${esc(t("deleteAccountBtn"))}</button></div></div>
  </div>`;
  document.getElementById("outBtn").onclick = async () => { await store.signOut(); refreshHeader(); location.hash = "#home"; };
  document.getElementById("dlBtn").onclick = async () => {
    try {
      const data = await store.exportMyData();
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `my-data-${today()}.json`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(t("downloadReady"));
    } catch (e) { console.error(e); toast(t("errSave")); }
  };
  const del = document.getElementById("delAcc");
  del.onclick = async () => {
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = t("deleteAccountConfirm"); return; }
    del.disabled = true; del.textContent = t("saving");
    try { await store.deleteMyAccount(); refreshHeader(); location.hash = "#home"; toast(t("accountDeleted")); }
    catch (e) { console.error(e); del.disabled = false; toast(t("errSave")); }
  };
}

async function viewEdit(id) {
  if (!(await requireAccount("#edit-" + id))) return;
  const c = await store.getCase(id);
  if (!c || c.owner_id !== store.uid) { app.innerHTML = emptyHtml(t("notFound"), "#mine", t("mineTitle")); return; }
  const f = (key, label, val, extra = "") => `<label><span class="lbl">${esc(t(label))}</span><input id="e_${key}" value="${esc(val || "")}" ${extra}></label>`;
  app.innerHTML = `<div class="form-wrap"><a class="crumb" href="#case-${esc(c.id)}">${icon("arrow", "ic flip-back")} ${esc(titleOf(c))}</a>
    <form class="panel stack" id="ef" novalidate><h1>${esc(t("editTitle"))}</h1>
    ${c.kind === "lost" ? f("pet_name", "fName", c.pet_name, 'maxlength="60"') : ""}
    ${f("breed", "fBreed", c.breed, 'maxlength="80"')}${f("colors", "fColors", c.colors, 'maxlength="160"')}${f("eye_color", "fEyes", c.eye_color, 'maxlength="40"')}
    ${f("markings", "fMarks", c.markings, 'maxlength="300"')}${f("district", "fDistrict", c.district, 'maxlength="80"')}
    <label><span class="lbl">${esc(t("fDesc"))}</span><textarea id="e_description" maxlength="2000">${esc(c.description || "")}</textarea></label>
    ${c.kind === "lost" ? f("reward", "fReward", c.reward, 'maxlength="60"') : ""}
    ${f("public_whatsapp", "fWhatsapp", c.public_whatsapp, 'type="tel" dir="ltr" maxlength="20"')}
    <label class="check"><input type="checkbox" id="e_waOk" ${c.public_whatsapp ? "checked" : ""}><span>${esc(t("waConsent"))}</span></label>
    <p class="err" id="eErr" role="alert" hidden></p>
    <div class="row"><button class="btn primary" type="submit">${esc(t("saveChanges"))}</button><a class="btn" href="#case-${esc(c.id)}">${esc(t("cancel"))}</a></div></form></div>`;
  document.getElementById("ef").onsubmit = async ev => {
    ev.preventDefault();
    const v = k => { const el = document.getElementById("e_" + k); return el ? el.value.trim() : undefined; };
    const wa = (v("public_whatsapp") || "").replace(/[^\d+]/g, "");
    const err = document.getElementById("eErr");
    if (wa && !document.getElementById("e_waOk").checked) { err.textContent = t("waConsentNeed"); err.hidden = false; return; }
    if (["pet_name", "breed", "colors", "eye_color", "markings", "district", "description", "reward"].some(k => hasPhone(v(k)))) { err.textContent = t("errPhoneText"); err.hidden = false; return; }
    const patch = { breed: v("breed") || null, colors: v("colors") || c.colors, eye_color: v("eye_color") || null, markings: v("markings") || null,
      district: v("district") || null, description: v("description") || null, public_whatsapp: wa || null };
    if (c.kind === "lost") { patch.pet_name = v("pet_name") || null; patch.reward = v("reward") || null; }
    try { await store.updateCase(c.id, patch); if (wa && !c.public_whatsapp) await store.addConsent("public_whatsapp"); toast(t("saved2")); location.hash = "#case-" + c.id; }
    catch (e) { console.error(e); err.textContent = t("errSave"); err.hidden = false; }
  };
}

async function viewAdmin() {
  if (!(await requireAccount("#admin"))) return;
  const p = await store.getProfile();
  if (!p || !p.is_admin) { app.innerHTML = emptyHtml(t("adminOnly")); return; }
  const [flags, hidden] = await Promise.all([store.listFlags(), store.listHidden()]);
  const cases = {};
  for (const id of [...new Set(flags.map(f => f.case_id))].slice(0, 50)) { try { cases[id] = await store.getCase(id); } catch (e) { /* gone */ } }
  app.innerHTML = `<h1>${esc(t("adminTitle"))}</h1>
    <div class="section-head"><div><h2>${esc(t("adminReports"))}</h2><p>${esc(t("adminReportsHelp"))}</p></div></div>
    <div class="list">${flags.length ? flags.map(f => { const c = cases[f.case_id]; return `<div class="msg"><div class="who"><bdi>${esc((f.created_at || "").slice(0, 16).replace("T", " "))}</bdi></div>
      <p style="margin:.3em 0">${esc(f.reason)}</p>
      ${c ? `<a href="#case-${esc(c.id)}">${esc(titleOf(c))}</a> <span class="pill soft">${esc(t(c.status))}</span>` : `<span class="muted">${esc(t("notFound"))}</span>`}
      <div class="row" style="margin-top:8px">${c && c.status !== "hidden" ? `<button class="btn sm lost" data-hide="${esc(c.id)}" type="button">${esc(t("adminHide"))}</button>` : ""}
      ${c ? `<button class="btn sm" data-block="${esc(c.owner_id)}" type="button">${esc(t("adminBlock"))}</button>` : ""}
      <button class="btn sm" data-clear="${esc(f.id)}" type="button">${esc(t("adminClear"))}</button></div></div>`; }).join("") : emptyHtml(t("adminNoReports"))}</div>
    <div class="section-head"><div><h2>${esc(t("adminHidden"))}</h2></div></div>
    <div class="list">${hidden.length ? hidden.map(c => `<div class="msg"><a href="#case-${esc(c.id)}">${esc(titleOf(c))}</a>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-unhide="${esc(c.id)}" type="button">${esc(t("adminUnhide"))}</button></div></div>`).join("") : `<p class="muted">—</p>`}</div>`;
  const act = (sel, fn) => app.querySelectorAll(sel).forEach(b => b.onclick = async () => { try { await fn(b); toast(t("saved2")); route(); } catch (e) { console.error(e); toast(t("errSave")); } });
  act("[data-hide]", b => store.updateCase(b.dataset.hide, { status: "hidden" }));
  act("[data-unhide]", b => store.updateCase(b.dataset.unhide, { status: "open" }));
  act("[data-block]", b => store.setBlocked(b.dataset.block, true));
  act("[data-clear]", b => store.clearFlag(b.dataset.clear));
}

/* ---------- header account button + alert badge ---------- */
function refreshHeader() {
  const tools = document.querySelector(".tools");
  let a = document.getElementById("acctBtn");
  if (!a && tools) { a = document.createElement("a"); a.id = "acctBtn"; a.className = "lang"; tools.prepend(a); }
  if (a) { a.href = store.uid ? "#account" : "#signin"; a.innerHTML = `${icon("user")}<span class="tool-label">${esc(t(store.uid ? "accountShort" : "signinShort"))}</span>`;
    a.setAttribute("aria-label", t(store.uid ? "accountShort" : "signinShort")); }
  const foot = document.querySelector(".foot");
  if (foot && !document.getElementById("legalLinks")) { const p = document.createElement("p"); p.id = "legalLinks"; foot.append(p); }
  const ll = document.getElementById("legalLinks");
  if (ll) ll.innerHTML = `<a href="#poster">${esc(t("makePoster"))}</a> · <a href="#privacy">${esc(t("privacyTitle"))}</a> · <a href="#terms">${esc(t("termsTitle"))}</a>${cfg.contactEmail ? ` · <bdi>${esc(cfg.contactEmail)}</bdi>` : ""}`;
}

// "New since your last visit": unread messages + new posts that match one of my open posts.
function seenKey() { return "lpf-seen-" + (store.uid || ""); }
function getSeen() { try { return JSON.parse(localStorage.getItem(seenKey()) || "null") || { at: new Date(0).toISOString() }; } catch (e) { return { at: new Date(0).toISOString() }; } }
function markSeen() { try { localStorage.setItem(seenKey(), JSON.stringify({ at: new Date().toISOString() })); } catch (e) { /* optional */ } }
async function computeNews() {
  if (!store.uid) return { msgs: 0, posts: 0 };
  const seen = getSeen().at;
  const [mine, msgs] = await Promise.all([store.myCases(), store.myMessages()]);
  const unread = msgs.filter(m => m.to_id === store.uid && (m.created_at || "") > seen).length;
  const fresh = new Set();
  for (const c of mine.filter(x => x.status === "open")) {
    const others = await store.listCases({ kind: c.kind === "lost" ? "found" : "lost", species: c.species, limit: 200 });
    others.filter(o => (o.created_at || "") > seen).forEach(o => { const r = c.kind === "lost" ? scoreMatch(c, o) : scoreMatch(o, c); if (r && r.score >= 40) fresh.add(o.id); });
  }
  return { msgs: unread, posts: fresh.size };
}
async function updateBadge() {
  let n = 0;
  try { const x = await computeNews(); n = x.msgs + x.posts; } catch (e) { n = 0; }
  document.querySelectorAll('[data-nav="mine"]').forEach(a => {
    let b = a.querySelector(".badge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "badge"; a.append(b); }
    b.textContent = n > 9 ? "9+" : String(n); b.setAttribute("aria-label", t("newItems").replace("{n}", n));
  });
}

const GOOGLE_G = `<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/* ---------- router ---------- */
async function route() {
  killMap();
  document.body.classList.remove("in-wizard");
  refreshHeader();
  const h = (location.hash || "#home").slice(1) || "home";
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", h === a.dataset.nav || (a.dataset.nav === "home" && h === "home") || (h.startsWith("report-") && a.dataset.nav === "browse-" + h.slice(7))));
  app.innerHTML = `<p class="muted">${esc(t("loading"))}</p>`;
  try {
    if (h === "home" || h === "") await viewHome();
    else if (h === "browse-lost" || h === "browse-found") await viewBrowse(h.slice(7));
    else if (h === "report-lost" || h === "report-found") { if (await requireAccount("#" + h)) viewReport(h.slice(7)); }
    else if (h.startsWith("case-")) await viewCase(h.slice(5));
    else if (h.startsWith("edit-")) await viewEdit(h.slice(5));
    else if (h === "mine") { if (await requireAccount("#mine")) await viewMine(); }
    else if (h === "signin") viewSignin();
    else if (h === "consent") await viewConsent();
    else if (h === "account") await viewAccount();
    else if (h === "privacy" || h === "terms") viewLegal(h);
    else if (h === "admin") await viewAdmin();
    else if (h === "poster" || h.startsWith("poster-")) await viewPosterMaker(h.startsWith("poster-") ? h.slice(7) : null);
    else await viewHome();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="err">${esc(t("errSave"))}</p>`;
  }
}

/* ---------- install as an app (PWA) ---------- */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; const b = document.getElementById("installCard"); if (b) b.hidden = installDismissed(); });
window.addEventListener("appinstalled", () => { installEvt = null; const b = document.getElementById("installCard"); if (b) b.hidden = true; });
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
function installDismissed() { try { return localStorage.getItem("lpf-install-off") === "1"; } catch (e) { return false; } }
function installCardHtml() {
  return `<div class="install-card" id="installCard" hidden>${icon("home")}<div><b>${esc(t("installTitle"))}</b><span id="installHelp">${esc(t("installSub"))}</span></div>
    <button class="btn sm primary" type="button" id="installBtn">${esc(t("installBtn"))}</button><button class="icon-btn" type="button" id="installX" aria-label="${esc(t("installLater"))}">${icon("x")}</button></div>`;
}
function wireInstall() {
  const card = document.getElementById("installCard"); if (!card) return;
  if (isStandalone() || installDismissed()) return;
  if (installEvt) card.hidden = false;
  else if (isIOS()) { card.hidden = false; document.getElementById("installHelp").textContent = t("installIOS"); document.getElementById("installBtn").hidden = true; }
  document.getElementById("installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* ignore */ } installEvt = null; card.hidden = true; };
  document.getElementById("installX").onclick = () => { card.hidden = true; try { localStorage.setItem("lpf-install-off", "1"); } catch (e) { /* optional */ } };
}

/* ---------- home ---------- */
async function viewHome() {
  const [lost, found, allLost, allFound] = await Promise.all([
    store.listCases({ kind: "lost", limit: 8 }), store.listCases({ kind: "found", limit: 8 }),
    store.listCases({ kind: "lost", limit: 1000 }), store.listCases({ kind: "found", limit: 1000 })]);
  const reunited = store.countReunited ? await store.countReunited() : 0;
  app.innerHTML = `
  <section class="hero" aria-labelledby="heroTitle"><div class="wrap hero-in">
    <div>
      <h1 id="heroTitle">${esc(t("heroTitle"))}</h1>
      <p class="lead">${esc(t("heroSub"))}</p>
      <div class="cta-grid">
        <a class="cta lost" href="#report-lost">${icon("search")}<div><b>${esc(t("iLost"))}</b><span>${esc(t("lostSub"))}</span></div></a>
        <a class="cta found" href="#report-found">${icon("heart")}<div><b>${esc(t("iFound"))}</b><span>${esc(t("foundSub"))}</span></div></a>
      </div>
      <a class="cta-mini" href="#poster">${icon("poster")}<span><b>${esc(t("makePoster"))}</b> · ${esc(t("pmHomeSub"))}</span>${icon("arrow", "ic flip")}</a>
      ${installCardHtml()}
      <ul class="trust"><li>${icon("check")}${esc(t("trustFree"))}</li><li>${icon("check")}${esc(t("trustNoSignup"))}</li><li>${icon("check")}${esc(t("trustPrivate"))}</li></ul>
    </div>
    ${HERO_ART}
  </div></section>
  <div class="stats" role="list">
    <div class="stat lost" role="listitem">${icon("search")}<div><b>${allLost.length}</b><span>${esc(t("statLost"))}</span></div></div>
    <div class="stat found" role="listitem">${icon("heart")}<div><b>${allFound.length}</b><span>${esc(t("statFound"))}</span></div></div>
    <div class="stat reunited" role="listitem">${icon("sparkle")}<div><b>${reunited}</b><span>${esc(t("statReunited"))}</span></div></div>
  </div>
  <div class="section-head"><div><h2>${esc(t("recentFound"))}</h2><p>${esc(t("recentFoundSub"))}</p></div><a class="link-arrow" href="#browse-found">${esc(t("seeAll"))} ${icon("arrow", "ic flip")}</a></div>
  <div class="grid">${found.map(cardHtml).join("") || emptyHtml(t("emptyFound"), "#report-found", t("iFound"), "found")}</div>
  <div class="section-head"><div><h2>${esc(t("recentLost"))}</h2><p>${esc(t("recentLostSub"))}</p></div><a class="link-arrow" href="#browse-lost">${esc(t("seeAll"))} ${icon("arrow", "ic flip")}</a></div>
  <div class="grid">${lost.map(cardHtml).join("") || emptyHtml(t("emptyLost"), "#report-lost", t("iLost"), "lost")}</div>
  <div class="section-head"><div><h2>${esc(t("howTitle"))}</h2></div></div>
  <div class="tips">
    <div class="tip">${icon("camera")}<h3>${esc(t("how1t"))}</h3><p>${esc(t("how1"))}</p></div>
    <div class="tip">${icon("sparkle")}<h3>${esc(t("how2t"))}</h3><p>${esc(t("how2"))}</p></div>
    <div class="tip">${icon("message")}<h3>${esc(t("how3t"))}</h3><p>${esc(t("how3"))}</p></div>
  </div>`;
  wireInstall();
}

/* ---------- poster maker (open to everyone; nothing leaves the browser) ---------- */
const PM_KEY = "lpf-poster-draft";
const waLink = phone => { const dg = String(phone || "").replace(/[^\d]/g, "").replace(/^00/, "").replace(/^0/, "966"); return dg.length >= 9 ? "https://wa.me/" + dg : ""; };

async function viewPosterMaker(caseId) {
  const c = caseId ? await store.getCase(caseId) : null;
  let draft = {};
  if (!c) { try { draft = JSON.parse(localStorage.getItem(PM_KEY) || "{}") || {}; } catch (e) { draft = {}; } }
  const st = c ? {
    kind: c.kind, species: c.species, name: c.pet_name || "", breed: c.breed || "", sex: c.sex || "unknown", colors: c.colors || "",
    eyes: c.eye_color || "", marks: c.markings || "", note: "", city: c.city || "riyadh", district: c.district || "", date: c.event_date || today(),
    reward: c.reward || "", phone: c.public_whatsapp || "", qr: "post", size: "a4", plang: "both", theme: "auto", tear: !!c.public_whatsapp,
  } : Object.assign({ kind: "lost", species: "cat", name: "", breed: "", sex: "unknown", colors: "", eyes: "", marks: "", note: "", city: "riyadh",
    district: "", date: today(), reward: "", phone: "", qr: "whatsapp", size: "a4", plang: "both", theme: "auto", tear: true }, draft);
  let photos = c ? (c.photos || []).map(safeImg).filter(Boolean).slice(0, 3) : [];
  const chip = (name, value, label, checked) => `<label class="chip"><input type="radio" name="${name}" value="${esc(value)}"${checked ? " checked" : ""}><span>${esc(label)}</span></label>`;
  const optional = `<small class="opt">${esc(t("optional"))}</small>`;
  const inp = (id, label, extra = "") => `<label><span class="lbl">${esc(t(label))} ${optional}</span><input id="pm_${id}" value="${esc(st[id])}" ${extra}></label>`;
  const districts = RIYADH_DISTRICTS.map(x => `<option value="${esc(lang === "ar" ? x[1] : x[0])}">`).join("");

  app.innerHTML = `<div class="pm">
  <div class="form-intro ${esc(st.kind)}" id="pmIntro">${icon("poster")}<div><h1>${esc(t("pmTitle"))}</h1><p>${esc(t("pmSub"))}</p></div></div>
  ${c ? `<p class="notice">${icon("check")}<span>${esc(t("pmFromPost"))}</span></p>` : ""}
  <div class="pm-grid">
  <form id="pmForm" class="stack" novalidate>
    <fieldset class="panel"><legend>${esc(t("pmKind"))}</legend>
      <div class="chips">${chip("kind", "lost", t("lost"), st.kind === "lost")}${chip("kind", "found", t("found"), st.kind === "found")}</div>
      <div class="fieldset-q">${esc(t("fSpecies"))}</div>
      <div class="chips">${SPECIES.map(x => chip("species", x, speciesWord(x), st.species === x)).join("")}</div>
    </fieldset>
    <fieldset class="panel"><legend>${esc(t("pmPhotos"))}</legend>
      <label class="drop" for="pmPhotos">${icon("camera")}<b>${esc(t("addPhotos"))}</b><span>${esc(t("pmPhotosHelp"))}</span>
        <input id="pmPhotos" type="file" accept="image/*" multiple></label>
      <div class="previews" id="pmPrev"></div>
    </fieldset>
    <fieldset class="panel"><legend>${esc(t("pmDetails"))}</legend>
      ${inp("name", "fName", 'maxlength="40" autocomplete="off"')}
      ${inp("breed", "fBreed", `maxlength="60" list="breeds"`)}<datalist id="breeds">${BREEDS.map(b => `<option value="${esc(b)}">`).join("")}</datalist>
      <div class="fieldset-q">${esc(t("fSex"))}</div>
      <div class="chips">${["male", "female", "unknown"].map(x => chip("sex", x, t(x), st.sex === x)).join("")}</div>
      ${inp("colors", "fColors", `maxlength="80" placeholder="${esc(t("fColorsPh"))}"`)}
      ${inp("eyes", "fEyes", 'maxlength="40"')}
      ${inp("marks", "fMarks", `maxlength="90" placeholder="${esc(t("fMarksPh"))}"`)}
      <label><span class="lbl">${esc(t("pmNote"))} ${optional}</span><textarea id="pm_note" maxlength="160" rows="2" placeholder="${esc(t("pmNotePh"))}">${esc(st.note)}</textarea></label>
    </fieldset>
    <fieldset class="panel"><legend>${esc(t("pmWhere"))}</legend>
      <label>${esc(t("fCity"))}<select id="pm_city">${CITIES.map(x => `<option value="${x.id}"${x.id === st.city ? " selected" : ""}>${esc(x[lang])}</option>`).join("")}</select></label>
      <label>${esc(t("fDistrict"))}<input id="pm_district" list="pmdl" maxlength="60" value="${esc(st.district)}" autocomplete="off"><datalist id="pmdl">${districts}</datalist></label>
      <label>${esc(t("date"))}<input id="pm_date" type="date" value="${esc(st.date)}" max="${today()}"></label>
    </fieldset>
    <fieldset class="panel"><legend>${esc(t("pmContact"))}</legend>
      <label><span class="lbl">${esc(t("pmPhone"))}</span><input id="pm_phone" type="tel" inputmode="tel" dir="ltr" maxlength="20" placeholder="05xxxxxxxx" value="${esc(st.phone)}" autocomplete="tel"></label>
      <p class="notice warn">${icon("shield")}<span>${esc(t("pmPhoneWarn"))}</span></p>
      ${inp("reward", "fReward", 'maxlength="40"')}
      <div class="fieldset-q">${esc(t("pmQr"))}</div>
      <div class="chips">${c ? chip("qr", "post", t("pmQrPost"), st.qr === "post") : ""}${chip("qr", "whatsapp", t("pmQrWa"), st.qr === "whatsapp")}${chip("qr", "none", t("pmQrNone"), st.qr === "none")}</div>
    </fieldset>
    <fieldset class="panel"><legend>${esc(t("pmDesign"))}</legend>
      <div class="fieldset-q">${esc(t("pmSize"))}</div>
      <div class="chips">${[["a4", "sizeA4"], ["a5", "sizeA5"], ["square", "sizeSquare"], ["story", "sizeStory"]].map(([v, k]) => chip("size", v, t(k), st.size === v)).join("")}</div>
      <div class="fieldset-q">${esc(t("pmLang"))}</div>
      <div class="chips">${[["both", "langBoth"], ["ar", "langAr"], ["en", "langEn"]].map(([v, k]) => chip("plang", v, t(k), st.plang === v)).join("")}</div>
      <div class="fieldset-q">${esc(t("pmTheme"))}</div>
      <div class="chips">${[["auto", "themeAuto"], ["teal", "themeTeal"], ["bold", "themeBold"]].map(([v, k]) => chip("theme", v, t(k), st.theme === v)).join("")}</div>
      <label class="check" id="pmTearWrap"><input type="checkbox" id="pm_tear"${st.tear ? " checked" : ""}><span>${esc(t("pmTear"))}<small class="muted" style="display:block">${esc(t("pmTearHelp"))}</small></span></label>
    </fieldset>
    <button class="btn primary pm-jump" type="button" id="pmJump">${icon("poster")}${esc(t("pmPreview"))}</button>
    <button class="btn ghost" type="button" id="pmReset">${esc(t("pmReset"))}</button>
  </form>
  <aside class="pm-side" aria-labelledby="pmPrevTitle">
    <div class="panel pm-preview">
      <h2 id="pmPrevTitle">${esc(t("pmPreview"))}</h2>
      <div class="pm-canvas" id="pmCanvas" role="img" aria-label="${esc(t("pmPreview"))}"></div>
      <p class="err" id="pmWarn" hidden></p>
      <div class="pm-actions" id="pmActions">
        <button class="btn primary" type="button" id="pmDl">${icon("download")}${esc(t("pmDownload"))}</button>
        <button class="btn" type="button" id="pmPrint">${icon("printer")}${esc(t("pmPrint"))}</button>
        <button class="btn" type="button" id="pmShare" hidden>${icon("share")}${esc(t("pmShare"))}</button>
      </div>
      <p class="muted small">${esc(t("pmPrintTip"))}</p>
      <p class="muted small">${icon("shield")} ${esc(t("pmPrivacy"))}</p>
      ${c ? "" : `<p class="small"><a href="#report-${esc(st.kind)}" id="pmAlso">${esc(t("pmAlsoPost"))}</a></p>`}
    </div>
  </aside>
  </div></div>`;

  const form = document.getElementById("pmForm");
  const val = id => (document.getElementById("pm_" + id)?.value || "").trim();
  const radio = n => (form.querySelector(`input[name="${n}"]:checked`) || {}).value;
  const read = () => ({
    kind: radio("kind"), species: radio("species"), sex: radio("sex"), qr: radio("qr"), size: radio("size"), plang: radio("plang"), theme: radio("theme"),
    name: val("name"), breed: val("breed"), colors: val("colors"), eyes: val("eyes"), marks: val("marks"), note: val("note"),
    city: val("city"), district: val("district"), date: val("date"), reward: val("reward"), phone: val("phone"), tear: document.getElementById("pm_tear").checked,
  });
  let current = null, seq = 0, timer = null;
  const fileName = v => `poster-${v.kind}-${(v.name || speciesWord(v.species)).replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 30)}.png`.toLowerCase();

  async function draw() {
    const v = read(), my = ++seq;
    if (!c) { try { localStorage.setItem(PM_KEY, JSON.stringify(v)); } catch (e) { /* optional */ } }
    document.getElementById("pmIntro").className = "form-intro " + v.kind;
    const also = document.getElementById("pmAlso"); if (also) also.href = "#report-" + v.kind;
    const print = v.size === "a4" || v.size === "a5";
    document.getElementById("pmTearWrap").hidden = !print;
    const qrUrl = v.qr === "post" && c ? caseLink(c.id) : v.qr === "whatsapp" ? waLink(v.phone) : "";
    const cityObj = city(v.city);
    const d = { kind: v.kind, species: v.species, name: v.name, breed: v.breed, sex: v.sex, colors: v.colors, eyes: v.eyes, marks: v.marks, note: v.note,
      district: v.district, cityEn: cityObj.en, cityAr: cityObj.ar, date: v.date, reward: v.reward, phone: v.phone, qrUrl, qrKind: v.qr, photos };
    const cv = await renderPoster(d, { size: v.size, lang: v.plang, theme: v.theme, tear: v.tear }, STRINGS);
    if (my !== seq) return; // a newer draw started
    current = { cv, v };
    const box = document.getElementById("pmCanvas"); box.replaceChildren(cv);
    box.dataset.size = v.size;
    const warn = document.getElementById("pmWarn");
    warn.hidden = !!(v.phone || qrUrl); warn.textContent = t("pmNoContact");
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(draw, 200); };
  form.addEventListener("input", later);
  form.addEventListener("change", later);

  function drawThumbs() {
    const box = document.getElementById("pmPrev");
    box.innerHTML = photos.map((p, i) => `<div class="pv${i === 0 ? " main" : ""}"><button type="button" class="pv-img" data-main="${i}" aria-label="${esc(t("pmMain"))} ${i + 1}"><img src="${esc(p)}" alt=""></button>
      ${i === 0 ? `<span class="pv-tag">${esc(t("pmMain"))}</span>` : ""}<button type="button" class="pv-x" data-rm="${i}" aria-label="${esc(t("pmRemove"))}">${icon("x")}</button></div>`).join("");
    box.querySelectorAll("[data-main]").forEach(b => b.onclick = () => { const i = +b.dataset.main; photos.unshift(...photos.splice(i, 1)); drawThumbs(); draw(); });
    box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { photos.splice(+b.dataset.rm, 1); drawThumbs(); draw(); });
  }
  document.getElementById("pmPhotos").onchange = async e => {
    for (const file of [...e.target.files].slice(0, 3)) {
      try { const blob = await shrink(file, 1600, 0.88); photos.push(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); })); }
      catch (err) { toast(t("errSave")); }
    }
    photos = photos.slice(-3); e.target.value = ""; drawThumbs(); draw();
  };
  document.getElementById("pmJump").onclick = () => document.getElementById("pmPrevTitle").scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("pmReset").onclick = () => { try { localStorage.removeItem(PM_KEY); } catch (e) { /* optional */ } photos = []; viewPosterMaker(caseId); };

  async function blobNow() { if (!current) await draw(); return canvasBlob(current.cv); }
  document.getElementById("pmDl").onclick = async () => {
    const blob = await blobNow(); if (!blob) { toast(t("errSave")); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName(current.v);
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  document.getElementById("pmPrint").onclick = async () => {
    if (!current) await draw();
    const sz = SIZES[current.v.size] || SIZES.a4;
    let area = document.getElementById("printArea");
    if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.append(area); }
    area.innerHTML = `<style>@page { size: ${sz.print || "auto"}; margin: ${sz.print ? "0" : "10mm"}; }</style><img alt="" src="${current.cv.toDataURL("image/png")}">`;
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 150);
  };
  const shareBtn = document.getElementById("pmShare");
  try { shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/png" })], "p.png", { type: "image/png" })] })); } catch (e) { shareBtn.hidden = true; }
  shareBtn.onclick = async () => {
    const blob = await blobNow(); if (!blob) return;
    try { await navigator.share({ files: [new File([blob], fileName(current.v), { type: "image/png" })], text: c ? caseLink(c.id) : "" }); } catch (e) { /* cancelled */ }
  };
  drawThumbs();
  await draw();
}

/* ---------- browse ---------- */
async function viewBrowse(kind) {
  const all = await store.listCases({ kind, limit: 500 });
  const speciesOpts = SPECIES.map(s => `<option value="${s}">${esc(speciesWord(s))}</option>`).join("");
  const cityOpts = CITIES.map(c => `<option value="${c.id}">${esc(c[lang])}</option>`).join("");
  app.innerHTML = `
  <div class="page-head"><div><h1>${esc(t(kind === "lost" ? "navLost" : "navFound"))}</h1><p>${esc(t(kind === "lost" ? "browseLostSub" : "browseFoundSub"))}</p></div>
    <a class="btn ${kind}" href="#report-${kind}">${icon(kind === "lost" ? "search" : "heart")}${esc(t(kind === "lost" ? "iLost" : "iFound"))}</a></div>
  <div class="filters" role="search">
    <div class="search-field">${icon("search")}<input id="fText" type="search" placeholder="${esc(t("searchPh"))}" aria-label="${esc(t("searchPh"))}"></div>
    <select id="fSpecies" aria-label="${esc(t("fSpecies"))}"><option value="">${esc(t("allSpecies"))}</option>${speciesOpts}</select>
    <select id="fCity" aria-label="${esc(t("fCity"))}"><option value="">${esc(t("allCities"))}</option>${cityOpts}</select>
    <div class="seg" role="group" aria-label="${esc(t("viewAs"))}"><button class="on" id="vList" type="button" aria-pressed="true">${esc(t("listView"))}</button><button id="vMap" type="button" aria-pressed="false">${icon("pin")}${esc(t("mapView"))}</button></div>
  </div>
  <p class="count" id="count" aria-live="polite"></p>
  <div id="mapBox" class="map" hidden></div>
  <div id="results" class="grid"></div>`;
  let mode = "list";
  const draw = () => {
    const sp = document.getElementById("fSpecies").value, ct = document.getElementById("fCity").value;
    const q = document.getElementById("fText").value.trim().toLowerCase();
    const rows = all.filter(c => (!sp || c.species === sp) && (!ct || c.city === ct) &&
      (!q || [c.pet_name, c.breed, c.colors, c.eye_color, c.markings, c.district, c.description].join(" ").toLowerCase().includes(q)));
    document.getElementById("count").textContent = t("resultsCount").replace("{n}", rows.length);
    document.getElementById("results").innerHTML = rows.map(cardHtml).join("") ||
      emptyHtml(t(all.length ? "noResults" : (kind === "lost" ? "emptyLost" : "emptyFound")), `#report-${kind}`, t(kind === "lost" ? "iLost" : "iFound"), kind);
    const box = document.getElementById("mapBox");
    box.hidden = mode !== "map";
    if (mode === "map") drawMap(box, rows);
  };
  const setOn = () => [["vList", "list"], ["vMap", "map"]].forEach(([id, m]) => { const b = document.getElementById(id); b.classList.toggle("on", mode === m); b.setAttribute("aria-pressed", String(mode === m)); });
  ["fSpecies", "fCity", "fText"].forEach(id => document.getElementById(id).addEventListener("input", draw));
  document.getElementById("vList").onclick = () => { mode = "list"; setOn(); draw(); };
  document.getElementById("vMap").onclick = () => { mode = "map"; setOn(); draw(); };
  if (!window.L) document.querySelector(".seg").hidden = true;
  draw();
}

function drawMap(box, rows) {
  if (!window.L) { box.hidden = true; return; }
  killMap();
  const withPin = rows.filter(c => typeof c.lat === "number" && typeof c.lng === "number");
  const center = withPin[0] ? [withPin[0].lat, withPin[0].lng] : [24.7136, 46.6753];
  activeMap = L.map(box).setView(center, 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(activeMap);
  const pts = [];
  withPin.forEach(c => {
    const m = L.circleMarker([c.lat, c.lng], { radius: 9, color: c.kind === "lost" ? "#B4232A" : "#1F6F4A", fillOpacity: .7 }).addTo(activeMap);
    const div = document.createElement("div");
    const a = document.createElement("a"); a.href = "#case-" + c.id; a.textContent = titleOf(c);
    const p = document.createElement("div"); p.textContent = placeLine(c) + " · " + c.event_date;
    div.append(a, p); m.bindPopup(div); pts.push([c.lat, c.lng]);
  });
  if (pts.length > 1) activeMap.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
}

/* ---------- report form: 4 short steps (photos → looks → where/when → contact & publish) ---------- */
const COLOUR_CHIPS = ["cCream", "cWhite", "cBlack", "cGrey", "cBrown", "cOrange", "cTabby", "cPoint", "cCalico", "cGolden"];
const EYE_CHIPS = ["eBlue", "eGreen", "eYellow", "eBrown", "eOdd"];
const SPECIES = ["cat", "dog", "bird", "other"];

function viewReport(kind) {
  const lost = kind === "lost";
  const DKEY = "lpf-draft-" + kind;
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem(DKEY) || "{}") || {}; } catch (e) { draft = {}; }
  const restored = Object.keys(draft).length > 0;
  const d = k => (draft[k] != null ? draft[k] : "");
  const chip = (name, value, label, type, checked) =>
    `<label class="chip"><input type="${type}" name="${name}" value="${esc(value)}"${checked ? " checked" : ""}><span>${esc(label)}</span></label>`;
  const opt = (v, label, sel) => `<option value="${v}"${sel ? " selected" : ""}>${esc(label)}</option>`;
  const districts = RIYADH_DISTRICTS.map(x => `<option value="${esc(lang === "ar" ? x[1] : x[0])}">`).join("");
  const optional = `<small class="opt">${esc(t("optional"))}</small>`;
  const colours = Array.isArray(draft.colourChips) ? draft.colourChips : [];
  const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  app.innerHTML = `<div class="form-wrap">
  <div class="form-intro ${kind}">${icon(lost ? "search" : "heart")}<div><h1>${esc(t(lost ? "reportLostTitle" : "reportFoundTitle"))}</h1><p>${esc(t(lost ? "reportLostSub" : "reportFoundSub"))}</p></div></div>
  ${restored ? `<p class="notice">${esc(t("draftRestored"))}</p>` : ""}
  <ol class="progress" aria-label="${esc(t("stepOf").replace("{n}", "1").replace("{total}", "4"))}">
    ${["stepPhotos", "stepLooks", "stepWhere", "stepPublish"].map((k, i) => `<li data-p="${i + 1}"><span>${i + 1}</span>${esc(t(k))}</li>`).join("")}
  </ol>
  <form id="rf" novalidate>
   <fieldset class="step panel" data-step="1">
     <legend>${esc(t("stepPhotos"))}</legend>
     <div class="fieldset-q">${esc(t("fSpecies"))}</div>
     <div class="chips">${SPECIES.map(s => chip("species", s, speciesWord(s), "radio", (d("species") || "cat") === s)).join("")}</div>
     <label class="drop" for="photos">${icon("camera")}<b>${esc(t("addPhotos"))}</b><span>${esc(t("addPhotosHelp"))}</span>
       <input id="photos" type="file" accept="image/*" multiple></label>
     <div class="previews" id="prev"></div>
     <p class="err" data-err="1" hidden role="alert"></p>
   </fieldset>

   <fieldset class="step panel" data-step="2" hidden>
     <legend>${esc(t("stepLooks"))}</legend>
     ${lost ? `<label><span class="lbl">${esc(t("fName"))} ${optional}</span><input id="pet_name" maxlength="60" value="${esc(d("pet_name"))}" autocomplete="off"></label>` : ""}
     <div class="fieldset-q">${esc(t("fSex"))}</div>
     <div class="chips">${["male", "female", "unknown"].map(s => chip("sex", s, t(s), "radio", (d("sex") || "unknown") === s)).join("")}</div>
     <div class="fieldset-q">${esc(t("fAge"))}</div>
     <div class="chips">${["young", "adult", "senior", "unknown"].map(s => chip("age_group", s, t(s), "radio", (d("age_group") || "unknown") === s)).join("")}</div>
     <div class="fieldset-q">${esc(t("colourChips"))}</div>
     <div class="chips">${COLOUR_CHIPS.map(k => chip("colour", t(k), t(k), "checkbox", colours.includes(t(k)))).join("")}</div>
     <label><span class="lbl">${esc(t("fColors"))} ${optional}</span><input id="colors" maxlength="160" placeholder="${esc(t("fColorsPh"))}" value="${esc(d("colors"))}"></label>
     <div class="fieldset-q">${esc(t("fEyes"))} ${optional}</div>
     <div class="chips">${EYE_CHIPS.map(k => chip("eyes", t(k), t(k), "radio", d("eyes") === t(k))).join("")}</div>
     <label><span class="lbl">${esc(t("fBreed"))} ${optional}</span><input id="breed" maxlength="80" list="breeds" value="${esc(d("breed"))}"><datalist id="breeds">${BREEDS.map(b => `<option value="${esc(b)}">`).join("")}</datalist></label>
     <label><span class="lbl">${esc(t("fMarks"))} ${optional}</span><input id="markings" maxlength="300" placeholder="${esc(t("fMarksPh"))}" value="${esc(d("markings"))}"></label>
     <p class="err" data-err="2" hidden role="alert"></p>
   </fieldset>

   <fieldset class="step panel" data-step="3" hidden>
     <legend>${esc(t("stepWhere"))}</legend>
     <div class="addr" id="addrBox">
       <label for="addrQ"><span class="lbl">${esc(t("addrLabel"))} ${optional}</span></label>
       <div class="addr-row"><input id="addrQ" type="search" enterkeyhint="search" maxlength="120" autocomplete="off" placeholder="${esc(t("addrPh"))}">
         <button class="btn sm" type="button" id="addrGo">${icon("search")}${esc(t("addrFind"))}</button></div>
       <button class="btn sm" type="button" id="useLoc">${icon("pin")}${esc(t("useLoc"))}</button>
       <p class="meta" id="addrMsg" role="status" aria-live="polite"></p>
       <ul class="addr-res" id="addrRes" hidden></ul>
       <small class="muted">${esc(t("addrHelp"))}</small>
     </div>
     <label>${esc(t("fCity"))}<select id="city">${CITIES.map(c => opt(c.id, c[lang], c.id === (d("city") || "riyadh"))).join("")}</select></label>
     <label>${esc(t("fDistrict"))}<input id="district" list="dl" maxlength="80" value="${esc(d("district"))}" autocomplete="off"><datalist id="dl">${districts}</datalist></label>
     <label>${esc(t(lost ? "fDateLost" : "fDateFound"))}<input id="event_date" type="date" value="${esc(d("event_date") || today())}" max="${today()}"></label>
     <div class="chips"><button type="button" class="chip-btn" data-date="${today()}">${esc(t("today"))}</button><button type="button" class="chip-btn" data-date="${yest}">${esc(t("yesterday"))}</button></div>
     <div id="pinWrap"><div class="fieldset-q">${esc(t("fPin"))} ${optional}</div><div id="pickMap" class="map small"></div>
       <button class="btn sm" type="button" id="clearPin" hidden>${esc(t("fPinClear"))}</button></div>
     <p class="err" data-err="3" hidden role="alert"></p>
   </fieldset>

   <fieldset class="step panel" data-step="4" hidden>
     <legend>${esc(t("stepPublish"))}</legend>
     <label><span class="lbl">${esc(t("fDesc"))} ${optional}</span><textarea id="description" maxlength="2000" placeholder="${esc(t(lost ? "fDescPhLost" : "fDescPhFound"))}">${esc(d("description"))}</textarea></label>
     ${lost ? `<label><span class="lbl">${esc(t("fReward"))} ${optional}</span><input id="reward" maxlength="60" value="${esc(d("reward"))}"></label>` : ""}
     <label><span class="lbl">${esc(t("fWhatsapp"))} ${optional}</span><input id="public_whatsapp" type="tel" inputmode="tel" dir="ltr" maxlength="20" placeholder="05xxxxxxxx" value="${esc(d("public_whatsapp"))}" autocomplete="tel"><small>${esc(t("fWhatsappHelp"))}</small></label>
     <label class="check" id="waOkWrap"><input type="checkbox" id="waOk"><span>${esc(t("waConsent"))}</span></label>
     <div class="review" id="review"></div>
     <label class="check"><input type="checkbox" id="consent"><span>${esc(t("fConsent"))}</span></label>
     <p class="err" data-err="4" hidden role="alert"></p>
   </fieldset>

   <div class="wizard-bar">
     <button class="btn" type="button" id="prevBtn">${esc(t("prev"))}</button>
     <span class="step-count" id="stepCount"></span>
     <button class="btn ${kind}" type="button" id="nextBtn">${esc(t("next"))}</button>
   </div>
  </form></div>`;
  document.body.classList.add("in-wizard");

  // ---- state ----
  let step = 1, pin = (draft.lat != null && draft.lng != null) ? { lat: draft.lat, lng: draft.lng } : null, marker = null, files = [];
  const form = document.getElementById("rf");
  const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
  const radio = name => { const el = form.querySelector(`input[name="${name}"]:checked`); return el ? el.value : ""; };
  const checks = name => Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(x => x.value);
  const saveDraft = () => {
    const o = { species: radio("species"), pet_name: val("pet_name"), sex: radio("sex"), age_group: radio("age_group"), colourChips: checks("colour"),
      colors: val("colors"), eyes: radio("eyes"), breed: val("breed"), markings: val("markings"), city: val("city"), district: val("district"),
      event_date: val("event_date"), description: val("description"), reward: val("reward"), public_whatsapp: val("public_whatsapp"),
      lat: pin ? pin.lat : null, lng: pin ? pin.lng : null };
    try { localStorage.setItem(DKEY, JSON.stringify(o)); } catch (e) { /* optional */ }
  };
  form.addEventListener("input", saveDraft);
  form.addEventListener("change", saveDraft);
  form.querySelectorAll("[data-date]").forEach(b => b.onclick = () => { document.getElementById("event_date").value = b.dataset.date; saveDraft(); });

  // ---- photos with remove buttons ----
  const drawPrev = () => {
    const prev = document.getElementById("prev"); prev.innerHTML = "";
    files.forEach((f, i) => {
      const w = document.createElement("div"); w.className = "pv";
      const img = document.createElement("img"); img.alt = ""; img.src = URL.createObjectURL(f);
      const x = document.createElement("button"); x.type = "button"; x.className = "pv-x"; x.innerHTML = icon("x"); x.setAttribute("aria-label", t("removePhoto"));
      x.onclick = () => { files.splice(i, 1); drawPrev(); };
      w.append(img, x); prev.append(w);
    });
  };
  document.getElementById("photos").addEventListener("change", ev => {
    const add = Array.from(ev.target.files || []).filter(f => f.type.startsWith("image/"));
    files = files.concat(add).slice(0, 4); ev.target.value = ""; drawPrev();
  });

  // ---- address search, "use my location" and map pick (step 3) ----
  let autoDistrict = ""; // last district we filled in ourselves, so we never overwrite what the person typed
  const addrMsg = m => { document.getElementById("addrMsg").textContent = m || ""; };
  const fillFrom = (place, force) => {
    if (!place) return;
    const dEl = document.getElementById("district");
    if (place.district && (force || !dEl.value.trim() || dEl.value.trim() === autoDistrict)) { dEl.value = place.district; autoDistrict = place.district; }
    const cid = matchCity(place.cityName, CITIES) || matchCity(place.label, CITIES);
    const cEl = document.getElementById("city");
    if (cid && cEl.value !== cid) cEl.value = cid;
    saveDraft();
  };
  const setPin = (lat, lng, zoom) => {
    pin = { lat: +(+lat).toFixed(5), lng: +(+lng).toFixed(5) };
    if (activeMap && window.L) {
      if (marker) marker.setLatLng([pin.lat, pin.lng]); else marker = L.marker([pin.lat, pin.lng]).addTo(activeMap);
      activeMap.setView([pin.lat, pin.lng], zoom || Math.max(activeMap.getZoom(), 15));
    }
    document.getElementById("clearPin").hidden = false; saveDraft();
  };
  const reverseFill = async (lat, lng) => {
    try { fillFrom(await reversePlace(lat, lng, lang), false); } catch (e) { /* the pin is enough */ }
  };
  const runSearch = async () => {
    const q = val("addrQ"), list = document.getElementById("addrRes");
    if (q.length < 2) { addrMsg(t("addrShort")); return; }
    list.hidden = true; list.innerHTML = ""; addrMsg(t("addrSearching"));
    let res = [];
    try { res = await searchPlaces(q, lang); } catch (e) { addrMsg(t("addrErr")); return; }
    if (!res.length) { addrMsg(t("addrNone")); return; }
    addrMsg(t("addrPick"));
    list.innerHTML = res.map((r, i) => `<li><button type="button" class="addr-opt" data-i="${i}">${icon("pin")}<span>${esc(r.label)}</span></button></li>`).join("");
    list.hidden = false;
    list.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
      const r = res[+b.dataset.i]; list.hidden = true;
      setPin(r.lat, r.lng, 16); fillFrom(r, true); addrMsg(t("addrPicked"));
    });
  };
  document.getElementById("addrGo").onclick = runSearch;
  document.getElementById("addrQ").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });
  document.getElementById("useLoc").onclick = async () => {
    addrMsg(t("locBusy"));
    try { const p = await myLocation(); setPin(p.lat, p.lng, 16); addrMsg(t("addrPicked")); await reverseFill(p.lat, p.lng); }
    catch (e) { addrMsg(t("locDenied")); }
  };
  document.getElementById("clearPin").onclick = () => { pin = null; if (marker) { marker.remove(); marker = null; } document.getElementById("clearPin").hidden = true; addrMsg(""); saveDraft(); };

  // ---- map (step 3) ----
  const initMap = () => {
    if (activeMap || !window.L) { if (!window.L) document.getElementById("pinWrap").hidden = true; return; }
    const c0 = pin ? [pin.lat, pin.lng] : [city(val("city")).lat, city(val("city")).lng];
    activeMap = L.map(document.getElementById("pickMap")).setView(c0, pin ? 14 : 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(activeMap);
    if (pin) { marker = L.marker(c0).addTo(activeMap); document.getElementById("clearPin").hidden = false; }
    activeMap.on("click", e => {
      pin = { lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) };
      if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(activeMap);
      document.getElementById("clearPin").hidden = false; saveDraft();
      reverseFill(pin.lat, pin.lng);
    });
    document.getElementById("city").addEventListener("change", ev => { if (!pin) { const c = city(ev.target.value); activeMap.setView([c.lat, c.lng], 11); } });
  };

  // ---- validation per step ----
  const check = n => {
    const err = form.querySelector(`[data-err="${n}"]`); let msg = "";
    if (n === 1 && !files.length) msg = t("errPhoto");
    if (n === 2 && !checks("colour").length && !val("colors")) msg = t("errColours");
    if (n === 2 && !msg && ["pet_name", "colors", "breed", "markings"].some(k => hasPhone(val(k)))) msg = t("errPhoneText");
    if (n === 3 && !val("event_date")) msg = t("errRequired") + t("fDate");
    if (n === 3 && !msg && hasPhone(val("district"))) msg = t("errPhoneText");
    if (n === 4 && !document.getElementById("consent").checked) msg = t("errConsent");
    if (n === 4 && !msg && val("public_whatsapp") && !document.getElementById("waOk").checked) msg = t("waConsentNeed");
    if (n === 4 && !msg && (hasPhone(val("description")) || hasPhone(val("reward")))) msg = t("errPhoneText");
    err.textContent = msg; err.hidden = !msg;
    if (msg) err.scrollIntoView({ block: "center", behavior: "smooth" });
    return !msg;
  };

  const colourText = () => [checks("colour").join(lang === "ar" ? "، " : ", "), val("colors")].filter(Boolean).join(lang === "ar" ? "؛ " : "; ");
  const drawReview = () => {
    const src = files[0] ? URL.createObjectURL(files[0]) : null;
    const title = val("pet_name") || val("breed") || speciesWord(radio("species"));
    const place = [val("district"), cityLabel(val("city"))].filter(Boolean).join(lang === "ar" ? "، " : ", ");
    document.getElementById("review").innerHTML = `<div class="fieldset-q">${esc(t("reviewTitle"))}</div>
      <div class="match">${src ? `<div class="thumb"><img src="${esc(src)}" alt=""></div>` : `<div class="thumb"></div>`}
      <div class="stack" style="gap:4px"><div><span class="pill ${kind}">${esc(t(kind))}</span></div><b>${esc(title)}</b>
      <div class="meta">${esc(place)} · <bdi>${esc(val("event_date"))}</bdi></div><div class="meta">${esc(colourText())}${radio("eyes") ? " · " + esc(radio("eyes")) : ""}</div></div></div>`;
  };

  const show = n => {
    step = n;
    form.querySelectorAll(".step").forEach(s => { s.hidden = +s.dataset.step !== n; });
    document.querySelectorAll(".progress li").forEach(li => { const p = +li.dataset.p; li.classList.toggle("on", p === n); li.classList.toggle("done", p < n); });
    document.getElementById("stepCount").textContent = t("stepOf").replace("{n}", n).replace("{total}", "4");
    document.getElementById("prevBtn").style.visibility = n === 1 ? "hidden" : "visible";
    document.getElementById("nextBtn").textContent = n === 4 ? t("submit") : t("next");
    if (n === 3) initMap();
    if (n === 4) drawReview();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  document.getElementById("prevBtn").onclick = () => show(Math.max(1, step - 1));
  document.getElementById("nextBtn").onclick = async () => {
    if (!check(step)) return;
    if (step < 4) { show(step + 1); return; }
    const btn = document.getElementById("nextBtn"); btn.disabled = true; btn.textContent = t("saving");
    const photos = [];
    try {
      const prof = store.demo ? null : await store.getProfile().catch(() => null);
      if (!(prof && prof.is_admin) && (await store.postsToday()) >= LIMITS.posts) { const e = new Error("rate_limit: posts"); e.code = "limit"; throw e; }
      for (const f of files) photos.push(await store.uploadPhoto(await shrink(f, 1280, 0.8)));
      const row = {
        kind, species: radio("species") || "cat", pet_name: val("pet_name") || null, breed: val("breed") || null,
        sex: radio("sex") || "unknown", age_group: radio("age_group") || "unknown",
        colors: colourText(), eye_color: radio("eyes") || null, markings: val("markings") || null, description: val("description") || null,
        city: val("city"), district: val("district") || null, lat: pin ? pin.lat : null, lng: pin ? pin.lng : null,
        event_date: val("event_date"), photos, public_whatsapp: val("public_whatsapp").replace(/[^\d+]/g, "") || null, reward: val("reward") || null
      };
      const id = await store.createCase(row);
      try { await store.addConsent("public_post"); if (row.public_whatsapp) await store.addConsent("public_whatsapp"); } catch (e) { /* consent rows are best effort */ }
      try { localStorage.removeItem(DKEY); } catch (e) { /* optional */ }
      toast(t("saved"));
      location.hash = "#case-" + id;
    } catch (e) {
      if (needLogin(e, "#report-" + kind)) return;
      console.error(e);
      if (photos.length) store.removePhotos(photos);
      const err = form.querySelector('[data-err="4"]'); err.textContent = errMsg(e); err.hidden = false;
      btn.disabled = false; btn.textContent = t("submit");
    }
  };
  show(1);
}

const BREEDS = ["Persian / شيرازي", "Himalayan / هملايا", "Scottish Fold / سكوتش فولد", "British Shorthair / بريتش", "Siamese / سيامي", "Ragdoll / راغدول",
  "Maine Coon / ماين كون", "Mixed / مختلط", "Husky / هاسكي", "German Shepherd / جيرمن شيبرد", "Golden Retriever / جولدن", "Pomeranian / بومرينيان", "Shih Tzu / شيتزو"];

// Checklist shown to the owner of an open post: the first things to do.
function todoPanel(c) {
  const items = (t(c.kind === "lost" ? "todoLost" : "todoFound") || "").split("|").filter(Boolean);
  return `<div class="panel todo"><h3>${icon("check")}${esc(t("todoTitle"))}</h3><ol>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>`;
}

/* ---------- case page ---------- */
async function viewCase(id) {
  const c = await store.getCase(id);
  if (!c) { app.innerHTML = emptyHtml(t("notFound"), "#home", t("back")); return; }
  const mine = !!store.uid && c.owner_id === store.uid;
  const photos = (c.photos || []).map(safeImg).filter(Boolean);
  const fact = (k, val) => val ? `<dt>${esc(t(k))}</dt><dd>${esc(val)}</dd>` : "";
  const waDigits = (c.public_whatsapp || "").replace(/[^\d]/g, "").replace(/^0/, "966");
  const link = caseLink(c.id);
  const shareText = `${t(c.kind)}: ${titleOf(c)} – ${placeLine(c)} – ${link}`;
  const sub = `${c.kind === "lost" ? t("lostIn") : t("foundIn")} ${placeLine(c)} · ${ago(c.event_date)}`;

  app.innerHTML = `
  <a class="crumb" href="#browse-${c.kind}">${icon("arrow", "ic flip-back")} ${esc(t(c.kind === "lost" ? "navLost" : "navFound"))}</a>
  <div class="case-grid">
    <div class="gallery">
      <div class="main" id="mainPhoto">${photos[0] ? `<img src="${esc(photos[0])}" alt="${esc(titleOf(c))}">` : `<div class="ph">${icon("paw")}<span>${esc(speciesWord(c.species))}</span></div>`}</div>
      ${photos.length > 1 ? `<div class="thumbs">${photos.map((p, i) => `<button type="button" data-i="${i}" class="${i === 0 ? "on" : ""}" aria-label="${esc(t("photo"))} ${i + 1}"><img src="${esc(p)}" alt=""></button>`).join("")}</div>` : ""}
    </div>
    <div class="stack">
      <div class="case-head"><div class="row">${pills(c)}</div><h1>${esc(titleOf(c))}</h1><p class="muted" style="margin:0">${esc(sub)}</p></div>
      ${c.reward ? `<p class="notice">${icon("sparkle")}<span><b>${esc(t("reward"))}:</b> ${esc(c.reward)}</span></p>` : ""}
      <div class="action-row">
        <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(shareText)}">${icon("whatsapp")}${esc(t("shareWhatsapp"))}</a>
        <button class="btn" id="copyBtn" type="button">${icon("link")}${esc(t("copyLink"))}</button>
        <a class="btn" id="posterBtn" href="#poster-${esc(c.id)}">${icon("poster")}${esc(t("poster"))}</a>
      </div>
      <div class="share-more" aria-label="${esc(t("shareOn"))}">
        <span class="muted">${esc(t("shareOn"))}</span>
        <button class="btn sm" id="nativeShare" type="button" hidden>${icon("share")}${esc(t("shareNative"))}</button>
        <a class="btn sm" target="_blank" rel="noopener" id="shTelegram" href="https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText.replace(" – " + link, ""))}">Telegram</a>
        <a class="btn sm" target="_blank" rel="noopener" id="shX" href="https://x.com/intent/post?text=${encodeURIComponent(shareText.replace(" – " + link, ""))}&url=${encodeURIComponent(link)}">X</a>
        <a class="btn sm" target="_blank" rel="noopener" id="shFacebook" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}">Facebook</a>
      </div>
      <button type="button" class="match-banner" id="matchBanner" hidden></button>
      ${mine && c.status === "open" ? todoPanel(c) : ""}
      <dl class="facts">
        ${fact("fSpecies", speciesWord(c.species))}${fact("fBreed", c.breed)}${fact("fSex", c.sex !== "unknown" ? t(c.sex) : "")}
        ${fact("fAge", c.age_group !== "unknown" ? t(c.age_group) : "")}${fact("fColors", c.colors)}${fact("fEyes", c.eye_color)}
        ${fact("fMarks", c.markings)}${fact("area", placeLine(c))}${fact("date", c.event_date)}
      </dl>
      ${c.description ? `<div class="panel"><h3>${esc(t("fDesc"))}</h3><p style="margin:0;white-space:pre-wrap">${esc(c.description)}</p></div>` : ""}
      ${mine ? ownerPanel(c) : (c.example ? "" : contactPanel(c, waDigits))}
      <p class="notice">${icon("shield")}<span>${esc(t("safety"))}</span></p>
    </div>
  </div>
  <div class="section-head"><div><h2>${esc(t("matchesTitle"))}</h2><p>${esc(t("matchesHelp"))}</p></div>${mine ? `<label class="check" style="padding:8px 12px"><input type="checkbox" id="showHidden"> <span>${esc(t("showHidden"))}</span></label>` : ""}</div>
  <div class="ai-box"><div class="ai-head">${icon("sparkle")}<div><b>${esc(t("aiTitle"))}</b><p>${esc(t(c.kind === "lost" ? "aiIntroLost" : "aiIntroFound"))}</p></div></div>
    <p class="ai-status" id="aiStatus" role="status" aria-live="polite"></p></div>
  <div id="matches" class="list"><p class="muted">${esc(t("loading"))}</p></div>
  ${mine ? `<div class="section-head"><div><h2>${esc(t("leadsTitle"))}</h2></div></div><div id="leads" class="list"></div>` : ""}
  ${c.status === "open" ? otherSitesPanel(c) : ""}`;

  app.querySelectorAll(".thumbs button").forEach(b => b.addEventListener("click", () => {
    const p = photos[+b.dataset.i]; const img = document.querySelector("#mainPhoto img"); if (img && p) img.src = p;
    app.querySelectorAll(".thumbs button").forEach(x => x.classList.toggle("on", x === b));
  }));
  const ns = document.getElementById("nativeShare");
  if (navigator.share) { ns.hidden = false; ns.onclick = async () => { try { await navigator.share({ title: titleOf(c), text: shareText.replace(" – " + link, ""), url: link }); } catch (e) { /* cancelled */ } }; }
  document.getElementById("copyBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast(t("copied")); } catch (e) { toast(link); }
  };
  if (mine) wireOwner(c); else if (!c.example) wireContact(c);
  await drawMatches(c, mine);
  if (mine) await drawLeads(c);
}

// Ready-made searches on other sites where people in Saudi Arabia post lost and found pets.
// Each link only opens that site's own search page in a new tab; nothing from the post is sent anywhere.
const SP_WORDS = {
  cat: { lostAr: "قطة مفقودة", foundAr: "قطة معثور عليها", en: "cat" },
  dog: { lostAr: "كلب مفقود", foundAr: "كلب معثور عليه", en: "dog" },
  bird: { lostAr: "طائر مفقود", foundAr: "طائر معثور عليه", en: "bird" },
  other: { lostAr: "حيوان أليف مفقود", foundAr: "حيوان أليف معثور عليه", en: "pet" },
};
function otherSiteLinks(c) {
  const w = SP_WORDS[c.species] || SP_WORDS.other;
  const want = c.kind === "lost" ? "found" : "lost"; // a lost pet is looked for among found posts, and the other way round
  const cc = CITIES.find(x => x.id === c.city && x.id !== "other");
  const arQ = [want === "found" ? w.foundAr : w.lostAr, cc ? cc.ar : ""].filter(Boolean).join(" ");
  const enQ = [want, w.en, cc ? cc.en : "Saudi Arabia"].join(" ");
  const tag = (want === "found" ? w.foundAr : w.lostAr).replace(/\s+/g, "_");
  const e = encodeURIComponent;
  return [
    { id: "haraj", name: t("siteHaraj"), href: `https://haraj.com.sa/search/${e(arQ)}` },
    { id: "instagram", name: "Instagram", href: `https://www.instagram.com/explore/tags/${e(tag)}/` },
    { id: "x", name: "X", href: `https://x.com/search?q=${e(`(${arQ}) OR (${enQ})`)}&f=live` },
    { id: "facebook", name: "Facebook", href: `https://www.facebook.com/search/posts/?q=${e(arQ)}` },
    { id: "tiktok", name: "TikTok", href: `https://www.tiktok.com/search?q=${e(arQ)}` },
    { id: "expatriates", name: "Expatriates.com", href: `https://www.google.com/search?q=${e("site:expatriates.com " + enQ)}&tbs=qdr:m` },
    { id: "google", name: "Google", href: `https://www.google.com/search?q=${e(`${arQ} OR ${enQ}`)}&tbs=qdr:m` },
  ];
}
function otherSitesPanel(c) {
  return `<div class="panel stack other-sites" id="otherSites"><h3>${icon("search")} ${esc(t("otherSitesTitle"))}</h3>
    <p class="muted" style="margin:0">${esc(t(c.kind === "lost" ? "otherSitesLost" : "otherSitesFound"))}</p>
    <div class="row">${otherSiteLinks(c).map(l => `<a class="btn sm" target="_blank" rel="noopener noreferrer" data-site="${l.id}" href="${esc(l.href)}">${esc(l.name)}</a>`).join("")}</div>
    <small class="muted">${esc(t("otherSitesNote"))}</small></div>`;
}

function ownerPanel(c) {
  return `<div class="panel stack"><h3>${esc(t("ownerTools"))}</h3><div class="row">
    ${c.status === "open" ? `<button class="btn sm found" data-status="reunited" type="button">${esc(t("markReunited"))}</button>
      <button class="btn sm" data-status="closed" type="button">${esc(t("closePost"))}</button>`
      : `<button class="btn sm" data-status="open" type="button">${esc(t("reopen"))}</button>`}
    <a class="btn sm" href="#edit-${esc(c.id)}">${esc(t("editPost"))}</a>
    <button class="btn sm" id="delBtn" type="button">${esc(t("deletePost"))}</button></div></div>`;
}
function wireOwner(c) {
  app.querySelectorAll("[data-status]").forEach(b => b.onclick = async () => {
    await store.updateCase(c.id, { status: b.dataset.status }); route();
  });
  const del = document.getElementById("delBtn");
  del.onclick = async () => {
    if (!del.dataset.armed) { del.dataset.armed = "1"; del.textContent = t("confirmDelete"); return; }
    await store.deleteCase(c.id); location.hash = "#mine";
  };
}
function contactPanel(c, waDigits) {
  return `<div class="panel stack"><h3>${esc(t("contactTitle"))}</h3>
    <textarea id="msgBody" maxlength="1000" placeholder="${esc(t("msgPh"))}"></textarea>
    <div class="row"><button class="btn sm primary" id="msgBtn" type="button">${esc(t("sendMsg"))}</button>
    ${waDigits ? `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${esc(waDigits)}">${esc(t("whatsappDirect"))}</a>` : ""}</div>
    <details><summary>${esc(t("report"))}</summary><div class="stack"><textarea id="flagBody" maxlength="300" placeholder="${esc(t("reportPh"))}"></textarea>
    <button class="btn sm" id="flagBtn" type="button">${esc(t("report"))}</button></div></details></div>`;
}
function wireContact(c) {
  document.getElementById("msgBtn").onclick = async () => {
    const body = document.getElementById("msgBody").value.trim(); if (!body) return;
    try { await store.sendMessage(c.id, c.owner_id, body); document.getElementById("msgBody").value = ""; toast(t("msgSent")); }
    catch (e) { if (!needLogin(e, "#case-" + c.id)) { console.error(e); toast(errMsg(e)); } }
  };
  document.getElementById("flagBtn").onclick = async () => {
    const reason = document.getElementById("flagBody").value.trim() || "unspecified";
    try { await store.flag(c.id, reason); toast(t("reported")); } catch (e) { if (!needLogin(e, "#case-" + c.id)) toast(errMsg(e)); }
  };
}

// Matches = attribute rules (match.js) + AI photo similarity (ai.js), shown together and re-ranked.
async function drawMatches(c, mine) {
  const box = document.getElementById("matches");
  const other = c.kind === "lost" ? "found" : "lost";
  const cands = await store.listCases({ kind: other, species: c.species, limit: 500 });
  const byId = {}; cands.forEach(x => { byId[x.id] = x; });
  const marks = mine ? await store.getMarks(c.id) : {};
  let visual = {}; // case id -> { pct, model }
  let ranked = combine(c, cands, visual);

  const show = () => {
    const showHidden = mine && document.getElementById("showHidden") && document.getElementById("showHidden").checked;
    const rows = ranked.filter(r => showHidden || marks[r.other.id] !== "not");
    if (!rows.length) { box.innerHTML = emptyHtml(t("matchesNone")); return; }
    box.innerHTML = rows.map(r => {
      const o = r.other, st = marks[o.id] || "";
      const reasons = r.reasons.map(k => (REASONS[k] || {})[lang]).filter(Boolean);
      if (r.photo != null && r.photo >= 65) reasons.unshift(t("reasonPhoto"));
      const why = reasons.map(w => `<span>${icon("check")}${esc(w)}</span>`).join("");
      const km = r.km != null ? ` · ${r.km < 1 ? "<1" : Math.round(r.km)} ${t("km")}` : "";
      return `<div class="match ${st}"><a href="#case-${esc(o.id)}">${thumbHtml(o)}</a>
        <div class="stack" style="gap:6px"><div class="row">${pills(o)} <span class="pill score">${esc(t("score"))} ${r.score}%</span>
          ${r.photo != null ? `<span class="pill ai">${icon("sparkle")}${esc(t("photoMatch"))} ${r.photo}%</span>` : ""}</div>
        <div class="meter" aria-hidden="true"><i style="width:${r.score}%"></i></div>
        <a href="#case-${esc(o.id)}"><b>${esc(titleOf(o))}</b></a>
        <div class="meta"><span>${esc(placeLine(o))} · ${esc(ago(o.event_date))}${esc(km)}</span></div>
        ${o.colors ? `<div class="meta"><span>${esc(o.colors)}${o.eye_color ? " · " + esc(o.eye_color) : ""}</span></div>` : ""}
        ${why ? `<div class="why">${why}</div>` : ""}
        ${mine ? `<div class="row">${["opened", "possible", "not"].map(s => `<button type="button" class="btn sm ${st === s ? "on" : ""}" data-mark="${s}" data-other="${esc(o.id)}">${esc(t(s === "opened" ? "markOpened" : s === "possible" ? "markPossible" : "markNot"))}</button>`).join("")}</div>` : ""}
        </div></div>`;
    }).join("");
    box.querySelectorAll("[data-mark]").forEach(b => b.onclick = async () => {
      const o = b.dataset.other, s = marks[o] === b.dataset.mark ? null : b.dataset.mark;
      if (s) marks[o] = s; else delete marks[o];
      show();
      try { await store.setMark(c.id, o, s); } catch (e) { if (!needLogin(e, "#case-" + c.id)) toast(t("errSave")); }
    });
  };
  if (mine) document.getElementById("showHidden").onchange = show;
  show();
  banner(ranked);

  // ---- AI photo search (runs after the page is shown, never blocks it) ----
  const panel = document.getElementById("aiStatus");
  const say = (msg, kind = "") => { if (panel) { panel.className = "ai-status " + kind; panel.innerHTML = msg; } };
  if (!(c.photos || []).length) { say(esc(t("aiNoPhoto"))); return; }
  try {
    let saved = await store.getVectors(c.id);
    let note = "";
    if (mine) {
      const work = missingWork(c, saved);
      if (work.needBasic.length || work.needAI.length) {
        const res = await computeFingerprints(c, saved, s => {
          if (s.stage === "loading") say(`${spinner()}${esc(t(s.pct ? "aiLoadingPct" : "aiLoading").replace("{p}", s.pct))}`, "busy");
          if (s.stage === "analysing") say(`${spinner()}${esc(t("aiAnalysing").replace("{n}", s.n).replace("{total}", s.total))}`, "busy");
        });
        if (res.rows.length) { try { await store.saveVectors(c, res.rows); } catch (e) { console.warn("save fingerprints", e); } }
        saved = saved.concat(res.rows);
        if (res.aiError && work.needAI.length) note = t("aiBasic");
      }
    }
    if (!saved.length) { say(esc(t(mine ? "aiOff" : "aiOwnerOnly"))); return; }
    say(`${spinner()}${esc(t("aiSearching").replace("{n}", cands.length))}`, "busy");
    // Search with every model this post has fingerprints for; the strongest model's verdict wins per candidate.
    const models = [...new Set(saved.map(r => r.model))];
    for (const m of models) {
      const hits = await store.searchVectors(saved.filter(r => r.model === m), other, c.species, m);
      for (const [id, sim] of Object.entries(hits)) {
        const pct = photoMatchPct(m, sim);
        const prev = visual[id];
        const strong = m !== BASIC_MODEL;
        if (!prev || (strong && prev.model === BASIC_MODEL) || (strong === (prev.model !== BASIC_MODEL) && pct > prev.pct)) visual[id] = { pct, model: m };
      }
    }
    ranked = combine(c, cands, visual);
    show();
    banner(ranked);
    const similar = Object.values(visual).filter(v => v.pct >= 65).length;
    const done = similar ? t("aiDone").replace("{n}", similar) : t("aiDoneNone");
    say(`${icon("sparkle")}<span>${esc(done)}${note ? " " + esc(note) : ""} ${esc(t("aiNote"))}</span>`, note ? "warn" : "ok");
  } catch (e) {
    console.warn("AI photo search", e);
    say(`${esc(t("aiFailed"))} <button type="button" class="btn sm" id="aiRetry">${esc(t("aiRetry"))}</button>`, "warn");
    const rb = document.getElementById("aiRetry"); if (rb) rb.onclick = () => drawMatches(c, mine);
  }
}

// Short banner near the top of a post: "3 possible matches – see them".
function banner(ranked) {
  const b = document.getElementById("matchBanner"); if (!b) return;
  const strong = ranked.filter(r => r.score >= 50).length;
  if (!strong) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = `${icon("sparkle")}<span>${esc(t("bannerMatches").replace("{n}", strong))}</span>${icon("arrow", "ic flip")}`;
  b.onclick = () => document.getElementById("matches").scrollIntoView({ behavior: "smooth", block: "start" });
}

function spinner() { return `<span class="spin" aria-hidden="true"></span>`; }

// Merge rule scores with photo scores into one ranked list.
function combine(c, cands, visual) {
  const out = [];
  for (const o of cands) {
    if (o.id === c.id) continue;
    const r = c.kind === "lost" ? scoreMatch(c, o) : scoreMatch(o, c);
    if (!r) continue; // different animal, or found before it was lost
    const v = visual[o.id];
    // Photos only ever raise a match: different angles or light can make the same pet look different.
    // AI fingerprints carry real weight; basic colour fingerprints only add a small bonus.
    let score = r.score;
    if (v && v.model !== BASIC_MODEL) score = Math.max(r.score, Math.round(0.6 * v.pct + 0.4 * r.score));
    else if (v) score = Math.min(100, r.score + Math.round(v.pct * 0.2));
    if (score < 20 && !(v && v.pct >= 55)) continue;
    const showPhoto = v && (v.model !== BASIC_MODEL || v.pct >= 30);
    out.push({ other: o, score, photo: showPhoto ? v.pct : null, km: r.km, reasons: r.reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}

// Self-healing in the background: make any missing fingerprints for this visitor's own open posts.
async function healMyPosts(cases) {
  const chip = document.getElementById("healChip");
  for (const c of cases.filter(x => x.status === "open" && (x.photos || []).length)) {
    try {
      const saved = await store.getVectors(c.id);
      const work = missingWork(c, saved);
      if (!work.needBasic.length && !work.needAI.length) continue;
      if (chip) chip.hidden = false;
      const res = await computeFingerprints(c, saved);
      if (res.rows.length) await store.saveVectors(c, res.rows);
    } catch (e) { console.warn("heal", c.id, e); }
  }
  if (chip) chip.hidden = true;
}

async function drawLeads(c) {
  const box = document.getElementById("leads");
  const leads = await store.externalLeads(c.id);
  if (!leads.length) { box.innerHTML = `<p class="muted">${esc(t("leadsNone"))}</p>`; return; }
  box.innerHTML = leads.map(l => {
    const href = typeof l.link === "string" && l.link.startsWith("https://") ? l.link : null;
    return `<div class="msg"><div class="who">${esc(l.source)} · ${esc(l.posted || "")}${l.photo_check ? " · " + esc(l.photo_check) : ""}</div>
      ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener"><b>${esc(l.title || href)}</b></a>` : `<b>${esc(l.title || "")}</b>`}
      ${l.summary ? `<p class="meta">${esc(l.summary)}</p>` : ""}</div>`;
  }).join("");
}

/* ---------- my posts ---------- */
async function viewMine() {
  const [cases, msgs] = await Promise.all([store.myCases(), store.myMessages()]);
  const caseIds = [...new Set(msgs.map(m => m.case_id))].slice(0, 30);
  const known = {}; cases.forEach(c => { known[c.id] = c; });
  for (const id of caseIds) if (!known[id]) { try { known[id] = await store.getCase(id); } catch (e) { /* skip */ } }
  const news = await computeNews();
  app.innerHTML = `
  <h1>${esc(t("mineTitle"))}</h1>
  <p class="ai-status busy" id="healChip" hidden>${spinner()}${esc(t("aiHealing"))}</p>
  ${news.msgs || news.posts ? `<button type="button" class="match-banner" id="newsBanner">${icon("sparkle")}<span>${esc(t("newsLine").replace("{m}", news.msgs).replace("{p}", news.posts))}</span></button>` : ""}
  <div class="grid" id="mineGrid" style="margin-top:14px">${cases.map(cardHtml).join("") || emptyHtml(t("mineEmpty"), "#report-lost", t("iLost"), "lost")}</div>
  <div class="section-head"><h2>${esc(t("inbox"))}</h2></div>
  <div class="list" id="inbox">${msgs.length ? msgs.map(m => {
    const fromMe = m.from_id === store.uid, c = known[m.case_id];
    const otherParty = fromMe ? m.to_id : m.from_id;
    return `<div class="msg ${fromMe ? "mine" : ""}"><div class="who">${esc(fromMe ? t("you") : t("visitor") + " " + shortId(m.from_id))} · ${esc((m.created_at || "").slice(0, 16).replace("T", " "))}
      · ${esc(t("aboutCase"))} ${c ? `<a href="#case-${esc(c.id)}">${esc(titleOf(c))}</a>` : ""}</div>
      <p style="margin:.3em 0; white-space:pre-wrap">${esc(m.body)}</p>
      ${!fromMe ? `<details><summary>${esc(t("reply"))}</summary><div class="stack"><textarea data-reply="${esc(m.id)}" maxlength="1000"></textarea>
      <button class="btn sm primary" type="button" data-send="${esc(m.id)}" data-case="${esc(m.case_id)}" data-to="${esc(otherParty)}">${esc(t("sendMsg"))}</button></div></details>` : ""}</div>`;
  }).join("") : `<p class="muted">${esc(t("inboxEmpty"))}</p>`}</div>`;

  healMyPosts(cases); // background: make missing AI fingerprints (self-healing)
  app.querySelectorAll("[data-send]").forEach(b => b.onclick = async () => {
    const ta = app.querySelector(`[data-reply="${CSS.escape(b.dataset.send)}"]`); const body = ta.value.trim(); if (!body) return;
    try { await store.sendMessage(b.dataset.case, b.dataset.to, body); toast(t("msgSent")); route(); } catch (e) { toast(errMsg(e)); }
  });
  const nb = document.getElementById("newsBanner");
  if (nb) nb.onclick = () => document.getElementById(news.msgs ? "inbox" : "mineGrid").scrollIntoView({ behavior: "smooth" });
  markSeen(); updateBadge();
}

/* ---------- start ---------- */
(async function start() {
  let saved = null;
  try { saved = localStorage.getItem("lpf-lang"); } catch (e) { /* optional */ }
  lang = saved || ((navigator.language || "").toLowerCase().startsWith("ar") ? "ar" : "en");
  try { store = await openStore(cfg); }
  catch (e) { console.error(e); app.innerHTML = `<p class="err">${esc(STRINGS[lang].errSave)}</p>`; return; }
  // Back from Google: continue to the consent step (new users) or to the page they wanted.
  if (store.justSignedIn) {
    let dest = "#consent";
    try { const p = await store.getProfile(); if (p && p.accepted_at && p.privacy_version === NOTICE_VERSION && p.is_adult) dest = takeNext(); } catch (e) { /* show consent */ }
    try { history.replaceState(null, "", location.pathname + dest); } catch (e) { location.hash = dest; }
  }
  setLang(lang);
  document.getElementById("langBtn").onclick = () => { setLang(lang === "ar" ? "en" : "ar"); refreshHeader(); route(); };
  // Text size: normal → large → extra large (remembered on this device).
  const sizes = ["", "lg", "xl"];
  let size = ""; try { size = localStorage.getItem("lpf-size") || ""; } catch (e) { /* optional */ }
  const applySize = () => { if (size) document.documentElement.dataset.size = size; else delete document.documentElement.dataset.size;
    document.getElementById("sizeLabel").textContent = t("textSize") + (size === "lg" ? " +" : size === "xl" ? " ++" : "");
    document.getElementById("sizeBtn").setAttribute("aria-label", t("textSize")); };
  applySize();
  document.getElementById("sizeBtn").onclick = () => { size = sizes.at((sizes.indexOf(size) + 1) % 3); try { localStorage.setItem("lpf-size", size); } catch (e) { /* optional */ } applySize(); };
  const skip = document.querySelector(".skip");
  if (skip) skip.onclick = e => { e.preventDefault(); app.focus(); };
  refreshHeader();
  window.addEventListener("hashchange", () => { route(); window.scrollTo(0, 0); });
  route();
  updateBadge();
  if (store.authError) toast(t("errSignin") + " (" + String(store.authError).slice(0, 80) + ")");
  if ("serviceWorker" in navigator && location.protocol === "https:" && window.top === window) navigator.serviceWorker.register("/sw.js").catch(() => { /* optional */ });
  if (cfg.analyticsToken) { // Cloudflare Web Analytics: no cookies, counts visits in total
    const s = document.createElement("script"); s.defer = true; s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: cfg.analyticsToken })); document.head.append(s);
  }
})();
