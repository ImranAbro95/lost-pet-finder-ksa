// Poster renderer: draws a lost / found pet poster on a canvas.
// Everything happens in the browser; nothing is uploaded.
//
// d (details): kind, species, name, breed, sex, colors, eyes, marks, note, district, cityEn, cityAr,
//              date, reward, phone, qrUrl, qrKind ("post" | "whatsapp"), photos (array of image URLs / data URLs)
// o (options): size ("a4" | "a5" | "square" | "story"), lang ("both" | "ar" | "en"), theme ("auto" | "teal" | "bold"), tear (bool)
// L: { en: STRINGS.en, ar: STRINGS.ar }

export const SIZES = {
  a4: { w: 1240, h: 1754, print: "A4 portrait" },
  a5: { w: 1240, h: 1754, print: "A5 portrait" },
  square: { w: 1080, h: 1080, print: null },
  story: { w: 1080, h: 1920, print: null },
};

const imgCache = new Map();
export function loadImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((res, rej) => {
    const i = new Image();
    if (!String(src).startsWith("data:") && !String(src).startsWith("blob:")) i.crossOrigin = "anonymous";
    i.onload = () => res(i); i.onerror = rej; i.src = src;
  });
  imgCache.set(src, p);
  p.catch(() => imgCache.delete(src));
  return p;
}

const FONT = `"Readex Pro", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif`;
const AR_FONT = `"IBM Plex Sans Arabic", "Readex Pro", Tahoma, Arial, sans-serif`;

function palette(kind, theme) {
  if (theme === "bold") return { band: "#111111", bandInk: "#FFD23F", accent: "#FFD23F", accentInk: "#111111", ink: "#111111", soft: "#333333", paper: "#FFFFFF", photoBg: "#F1F1F1" };
  if (theme === "teal") return { band: "#0B4F55", bandInk: "#FFFFFF", accent: "#F4B740", accentInk: "#1B1B1B", ink: "#13232A", soft: "#3E525A", paper: "#FFFFFF", photoBg: "#EAF2F2" };
  return kind === "found"
    ? { band: "#1E7A4C", bandInk: "#FFFFFF", accent: "#F4B740", accentInk: "#1B1B1B", ink: "#13202A", soft: "#3E4E5A", paper: "#FFFFFF", photoBg: "#EDF4EF" }
    : { band: "#C2362F", bandInk: "#FFFFFF", accent: "#F4B740", accentInk: "#1B1B1B", ink: "#13202A", soft: "#3E4E5A", paper: "#FFFFFF", photoBg: "#F6EEEE" };
}

// Split text into lines that fit maxW (at most maxLines; the last one gets "…").
function wrap(g, text, maxW, maxLines = 3) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = []; let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (g.measureText(next).width <= maxW || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, maxLines).map(l => fit(g, l, maxW));
  if (lines.length > maxLines) out[maxLines - 1] = fit(g, out[maxLines - 1] + " …", maxW);
  return out;
}
function fit(g, s, maxW) {
  s = String(s || "");
  if (g.measureText(s).width <= maxW) return s;
  while (s.length > 1 && g.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Draw the photo so the whole animal is visible (contain), on a soft background.
function drawPhoto(g, img, x, y, w, h, bg) {
  g.save(); roundRect(g, x, y, w, h, 18); g.clip();
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  if (img) {
    // Blurred fill behind the photo so empty space does not look empty.
    const kc = Math.max(w / img.width, h / img.height);
    try { g.filter = "blur(24px) saturate(1.1)"; } catch (e) { /* optional */ }
    g.globalAlpha = 0.35; g.drawImage(img, x + (w - img.width * kc) / 2, y + (h - img.height * kc) / 2, img.width * kc, img.height * kc);
    g.globalAlpha = 1; try { g.filter = "none"; } catch (e) { /* optional */ }
    const k = Math.min(w / img.width, h / img.height);
    g.drawImage(img, x + (w - img.width * k) / 2, y + (h - img.height * k) / 2, img.width * k, img.height * k);
  } else {
    g.fillStyle = "rgba(0,0,0,.18)"; const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 9;
    [[-1.2, -0.6], [0, -1.1], [1.2, -0.6]].forEach(([dx, dy]) => { g.beginPath(); g.arc(cx + dx * r * 1.3, cy + dy * r * 1.3, r * 0.42, 0, 7); g.fill(); });
    g.beginPath(); g.ellipse(cx, cy + r * 0.6, r * 0.95, r * 0.75, 0, 0, 7); g.fill();
  }
  g.restore();
}

function drawQR(g, text, x, y, size) {
  if (!window.qrcode || !text) return false;
  try {
    const q = window.qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), cell = size / (n + 2);
    g.fillStyle = "#FFFFFF"; g.fillRect(x, y, size, size);
    g.fillStyle = "#000000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(x + (c + 1) * cell, y + (r + 1) * cell, Math.ceil(cell), Math.ceil(cell));
    return true;
  } catch (e) { return false; }
}

export async function renderPoster(d, o, L) {
  const first = await drawPoster(d, o, L, 0);
  return first.slack > 8 ? (await drawPoster(d, o, L, first.slack)).cv : first.cv;
}

// Wrap Latin values inside Arabic lines so numbers and words keep their order.
const iso = v => /[\u0600-\u06FF]/.test(String(v)) ? String(v) : "\u2068" + v + "\u2069";

async function drawPoster(d, o, L, extra) {
  const size = SIZES[o.size] || SIZES.a4;
  const W = size.w, H = size.h, s = W / 1240;
  const print = o.size === "a4" || o.size === "a5";
  const tear = print && o.tear && !!d.phone;
  const both = o.lang === "both", useAr = o.lang !== "en", useEn = o.lang !== "ar";
  const lost = d.kind !== "found";
  const P = palette(d.kind, o.theme);
  const en = L.en, ar = L.ar;
  try { if (document.fonts) { await document.fonts.load(`700 40px "Readex Pro"`); await document.fonts.load(`700 40px "IBM Plex Sans Arabic"`); } } catch (e) { /* fonts optional */ }

  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const f = (w, px, ara) => `${w} ${Math.round(px * s)}px ${ara ? AR_FONT : FONT}`;
  const M = Math.round(64 * s); // side margin
  const inner = W - 2 * M;
  g.fillStyle = P.paper; g.fillRect(0, 0, W, H);
  g.textBaseline = "alphabetic";

  // ---- measure fixed blocks first, then give the photo whatever space is left ----
  const headH = Math.round((both ? 250 : 190) * s);
  const tearH = tear ? Math.round(250 * s) : 0;
  const nameTxt = String(d.name || "").trim();
  const nameH = nameTxt ? Math.round(96 * s) : 0;

  const sp = { en: en[d.species] || d.species || "", ar: ar[d.species] || d.species || "" };
  const sexWord = l => (d.sex === "male" || d.sex === "female") ? L[l][d.sex] : "";
  const fmtDate = l => { if (!d.date) return ""; try { return new Date(d.date + "T12:00:00").toLocaleDateString(l === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d.date; } };
  const lineSets = { en: [], ar: [] }, placeLines = { en: "", ar: "" };
  for (const l of ["en", "ar"]) {
    const T = L[l], out = lineSets[l], I = v => (l === "ar" && v ? iso(v) : v);
    const first = [I(d.breed), sexWord(l)].filter(Boolean).join(" · ");
    if (first) out.push(first);
    if (d.colors) out.push(I(d.colors));
    if (d.eyes) out.push(`${T.fEyes}: ${I(d.eyes)}`);
    if (d.marks) out.push(`${T.posterMarks}: ${I(d.marks)}`);
    const place = [I(d.district), l === "ar" ? d.cityAr : d.cityEn].filter(Boolean).join(l === "ar" ? "، " : ", ");
    if (place || d.date) placeLines[l] = `${lost ? T.posterLastSeen : T.posterFoundAt}: ${[place, fmtDate(l)].filter(Boolean).join(" · ")}`;
  }
  const compact = o.size === "square";
  const maxDetail = compact ? 2 : 4;
  const detailPx = both ? 34 : 40, detailGap = Math.round((both ? 50 : 58) * s);
  const detailRows = Math.min(maxDetail, both ? Math.max(lineSets.en.length, lineSets.ar.length) : (useAr ? lineSets.ar.length : lineSets.en.length));
  const placeRows = (useEn && placeLines.en ? 1 : 0) + (useAr && placeLines.ar ? 1 : 0);
  const detailH = (detailRows + placeRows) ? (detailRows + placeRows) * detailGap + Math.round(20 * s) : 0;

  g.font = f(500, 32);
  const noteLines = d.note && !compact ? wrap(g, d.note, inner - Math.round(40 * s), 2) : [];
  const noteH = noteLines.length ? noteLines.length * Math.round(44 * s) + Math.round(36 * s) : 0;
  const rewardH = d.reward ? Math.round(84 * s) : 0;
  const qrSize = Math.round((compact ? 170 : 210) * s);
  const textH = Math.round(((useAr ? 50 : 0) + (useEn ? 30 : 0) + (d.phone ? (compact ? 76 : 96) : 0) + 50) * s);
  const contactH = Math.max(d.qrUrl ? qrSize + Math.round(50 * s) : 0, textH);
  const gaps = Math.round(24 * s) * 5;
  let photoH = H - headH - tearH - nameH - detailH - noteH - rewardH - contactH - gaps - Math.round(30 * s);
  photoH = Math.max(Math.round(260 * s), photoH) + Math.floor(extra);

  // ---- header band ----
  g.fillStyle = P.band; g.fillRect(0, 0, W, headH);
  g.fillStyle = P.bandInk; g.textAlign = "center";
  const headAr = `${lost ? ar.posterLost : ar.posterFound} · ${sp.ar}`;
  const headEn = `${lost ? en.posterLost : en.posterFound} ${sp.en.toUpperCase()}`;
  if (both) {
    g.direction = "rtl"; g.font = f(700, 104, true); g.fillText(fit(g, headAr, inner), W / 2, Math.round(118 * s));
    g.direction = "ltr"; g.font = f(700, 72); g.fillText(fit(g, headEn, inner), W / 2, Math.round(212 * s));
  } else if (useAr) {
    g.direction = "rtl"; g.font = f(700, 120, true); g.fillText(fit(g, headAr, inner), W / 2, Math.round(135 * s));
  } else {
    g.direction = "ltr"; g.font = f(700, 120); g.fillText(fit(g, headEn, inner), W / 2, Math.round(138 * s));
  }

  // ---- photos ----
  let y = headH + Math.round(28 * s);
  const imgs = [];
  for (const src of (d.photos || []).slice(0, 3)) { try { imgs.push(await loadImg(src)); } catch (e) { /* skip unreadable photo */ } }
  if (imgs.length > 1 && !compact) {
    const gap = Math.round(16 * s), sideW = Math.round(inner * 0.3), mainW = inner - sideW - gap;
    drawPhoto(g, imgs[0], M, y, mainW, photoH, P.photoBg);
    const n = imgs.length - 1, eachH = Math.round((photoH - gap * (n - 1)) / n);
    imgs.slice(1).forEach((im, i) => drawPhoto(g, im, M + mainW + gap, y + i * (eachH + gap), sideW, eachH, P.photoBg));
  } else drawPhoto(g, imgs[0] || null, M, y, inner, photoH, P.photoBg);
  y += photoH + Math.round(24 * s);

  // ---- name ----
  if (nameTxt) {
    g.fillStyle = P.ink; g.textAlign = "center"; g.direction = /[؀-ۿ]/.test(nameTxt) ? "rtl" : "ltr";
    g.font = f(700, 76, g.direction === "rtl"); g.fillText(fit(g, nameTxt, inner), W / 2, y + Math.round(72 * s));
    y += nameH;
  }

  // ---- details ----
  if (detailRows) {
    y += Math.round(12 * s);
    g.fillStyle = P.ink;
    const colW = both ? Math.round((inner - 40 * s) / 2) : inner;
    const draw = (arr, isAr, x, align) => {
      g.direction = isAr ? "rtl" : "ltr"; g.textAlign = align;
      arr.slice(0, maxDetail).forEach((line, i) => { g.font = f(i === 0 ? 600 : 500, detailPx, isAr); g.fillText(fit(g, line, colW), x, y + (i + 1) * detailGap - Math.round(12 * s)); });
    };
    if (both) { draw(lineSets.en, false, M, "left"); draw(lineSets.ar, true, W - M, "right"); }
    else if (useAr) draw(lineSets.ar, true, W / 2, "center");
    else draw(lineSets.en, false, W / 2, "center");
    let py = y + detailRows * detailGap - Math.round(12 * s);
    g.textAlign = "center";
    if (useAr && placeLines.ar) { py += detailGap; g.direction = "rtl"; g.font = f(600, detailPx, true); g.fillText(fit(g, placeLines.ar, inner), W / 2, py); }
    if (useEn && placeLines.en) { py += detailGap; g.direction = "ltr"; g.font = f(600, detailPx); g.fillText(fit(g, placeLines.en, inner), W / 2, py); }
    y += detailH;
  }

  // ---- note ----
  if (noteLines.length) {
    const isAr = /[؀-ۿ]/.test(d.note);
    g.fillStyle = P.photoBg; roundRect(g, M, y, inner, noteH - Math.round(12 * s), 14 * s); g.fill();
    g.fillStyle = P.ink; g.font = f(500, 32, isAr); g.direction = isAr ? "rtl" : "ltr"; g.textAlign = "center";
    noteLines.forEach((l, i) => g.fillText(l, W / 2, y + Math.round(48 * s) + i * Math.round(44 * s)));
    y += noteH;
  }

  // ---- reward ----
  if (d.reward) {
    g.fillStyle = P.accent; roundRect(g, M, y, inner, rewardH - Math.round(12 * s), 14 * s); g.fill();
    g.fillStyle = P.accentInk; g.textAlign = "center"; g.direction = useEn ? "ltr" : "rtl"; g.font = f(700, 40, true);
    const by = y + Math.round(50 * s), half = inner / 2 - 30 * s;
    if (both) {
      g.direction = "ltr"; g.textAlign = "left"; g.fillText(fit(g, `${en.reward}: ${d.reward}`, half), M + 24 * s, by);
      g.direction = "rtl"; g.textAlign = "right"; g.fillText(fit(g, `${ar.reward}: ${iso(d.reward)}`, half), W - M - 24 * s, by);
    } else g.fillText(fit(g, useAr ? `${ar.reward}: ${iso(d.reward)}` : `${en.reward}: ${d.reward}`, inner - 40 * s), W / 2, by);
    y += rewardH;
  }

  // ---- contact: QR + phone ----
  y += Math.round(14 * s);
  const hasQR = !!d.qrUrl && drawQR(g, d.qrUrl, M, y, qrSize);
  const tx = hasQR ? M + qrSize + Math.round(30 * s) : M;
  const tw = W - M - tx;
  const align = hasQR ? "left" : "center", ax = hasQR ? tx : W / 2;
  g.fillStyle = P.ink; g.textAlign = align;
  let cy = y + Math.round(46 * s);
  const ask = lost ? { en: en.posterAskLost, ar: ar.posterAskLost } : { en: en.posterAskFound, ar: ar.posterAskFound };
  if (useAr) { g.direction = "rtl"; g.textAlign = hasQR ? "right" : "center"; g.font = f(600, 36, true); g.fillText(fit(g, ask.ar, tw), hasQR ? W - M : W / 2, cy); cy += Math.round(50 * s); }
  if (useEn) { g.direction = "ltr"; g.textAlign = align; g.font = f(500, 32); g.fillText(fit(g, ask.en, tw), ax, cy); cy += Math.round(30 * s); }
  if (d.phone) {
    g.direction = "ltr"; g.textAlign = align; g.font = f(700, compact ? 64 : 80); g.fillStyle = P.band === "#111111" ? "#111111" : P.band;
    g.fillText(fit(g, d.phone, tw), ax, cy + Math.round((compact ? 64 : 80) * s)); cy += Math.round((compact ? 76 : 96) * s);
  }
  if (hasQR) {
    g.fillStyle = P.soft; g.direction = "ltr"; g.textAlign = "left"; g.font = f(500, 24, true);
    const qt = d.qrKind === "whatsapp" ? (both ? `${en.posterScanWa} · ${ar.posterScanWa}` : useAr ? ar.posterScanWa : en.posterScanWa)
      : (both ? `${en.posterScan} · ${ar.posterScan}` : useAr ? ar.posterScan : en.posterScan);
    g.fillText(fit(g, qt, inner), M, y + qrSize + Math.round(30 * s));
  }
  const endY = Math.max(cy + Math.round(10 * s), hasQR ? y + qrSize + Math.round(40 * s) : 0);
  const slack = (H - tearH - Math.round(36 * s)) - endY;

  // ---- tear-off strips ----
  if (tear) {
    const top = H - tearH, n = 8, w = W / n;
    g.strokeStyle = "#9AA5AD"; g.lineWidth = Math.max(1, 2 * s); g.setLineDash([10 * s, 8 * s]);
    g.beginPath(); g.moveTo(0, top); g.lineTo(W, top); g.stroke();
    for (let i = 1; i < n; i++) { g.beginPath(); g.moveTo(i * w, top); g.lineTo(i * w, H); g.stroke(); }
    g.setLineDash([]);
    const tag = (useAr && !useEn) ? `${lost ? ar.posterLost : ar.posterFound} ${sp.ar}` : `${lost ? en.posterLost : en.posterFound} ${sp.en}`;
    for (let i = 0; i < n; i++) {
      g.save(); g.translate(i * w + w / 2, top + tearH / 2); g.rotate(-Math.PI / 2);
      g.textAlign = "center"; g.direction = "ltr"; g.fillStyle = P.ink;
      g.font = f(700, 30); g.fillText(fit(g, d.phone, tearH - 20 * s), 0, -Math.round(6 * s));
      g.fillStyle = P.soft; g.font = f(500, 22, true); g.fillText(fit(g, (nameTxt ? nameTxt + " · " : "") + tag, tearH - 20 * s), 0, Math.round(26 * s));
      g.restore();
    }
  }
  return { cv, slack };
}

export function canvasBlob(cv) {
  return new Promise(res => { try { cv.toBlob(res, "image/png"); } catch (e) { res(null); } });
}
