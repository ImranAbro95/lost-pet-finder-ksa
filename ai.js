// AI photo matching ("pet face recognition"), free and on the visitor's own device.
//
// How it works
//  1. Each photo is cut into two views: the whole animal and a close-up of the head area.
//  2. An image-recognition model (DINOv2 by default, CLIP as a backup) turns each view into a
//     "fingerprint": a list of numbers that describes face shape, coat pattern and colours.
//  3. Fingerprints are saved with the post. Finding look-alikes is then a fast comparison of
//     fingerprints (cosine similarity) against every post of the opposite kind and same animal.
//
// Self-healing
//  - A cheap "basic" colour-layout fingerprint is always made, so every post can be compared
//    even on devices where the AI model cannot load.
//  - If the AI fails (old phone, no data, blocked download), the post is still published and the
//    failure is remembered for 10 minutes; the AI fingerprints are made automatically the next time
//    the owner opens the site ("My posts" or the post page).
//  - Posts made before AI existed, or with an older model, are upgraded the same way.

const TJS_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
export const BASIC_MODEL = "basic-colour-v1";
const FAIL_KEY = "lpf-ai-failed-at";

// Per-model scale: raw cosine similarity -> 0-100 "photo match".
const SCALES = {
  "Xenova/dinov2-small": [0.45, 0.85, 100],
  "Xenova/clip-vit-base-patch32": [0.75, 0.97, 100],
  [BASIC_MODEL]: [0.55, 0.97, 60] // basic fingerprints are weak evidence: capped at 60
};

export function aiSettings() {
  const c = (window.LPF_CONFIG && window.LPF_CONFIG.ai) || {};
  return {
    enabled: c.enabled !== false,
    models: [c.model || "Xenova/dinov2-small", c.fallbackModel || "Xenova/clip-vit-base-patch32"].filter(Boolean),
    maxPhotos: c.maxPhotos || 3
  };
}

export function photoMatchPct(model, sim) {
  const [lo, hi, cap] = SCALES[model] || [0.6, 0.95, 80];
  const k = Math.max(0, Math.min(1, (sim - lo) / (hi - lo)));
  return Math.round(k * cap);
}

let extractor = null, aiModel = null, loading = null;

function recentlyFailed() {
  try { const t = +sessionStorage.getItem(FAIL_KEY); return t && Date.now() - t < 10 * 60e3; } catch (e) { return false; }
}
function markFailed() { try { sessionStorage.setItem(FAIL_KEY, String(Date.now())); } catch (e) { /* optional */ } }

export function preferredModel() { return aiModel || aiSettings().models[0]; }

// Load the AI model once (it is cached by the browser after the first download).
export async function loadAI(onProgress) {
  if (extractor) return aiModel;
  if (!aiSettings().enabled) throw new Error("ai-disabled");
  if (recentlyFailed()) throw new Error("ai-recently-failed");
  if (!loading) {
    loading = (async () => {
      const { pipeline, env } = await import(TJS_URL);
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      let lastErr = null;
      for (const m of aiSettings().models) {
        try {
          extractor = await pipeline("image-feature-extraction", m, {
            quantized: true,
            progress_callback: p => { if (onProgress && p && p.status === "progress" && typeof p.progress === "number") onProgress(Math.round(p.progress)); }
          });
          aiModel = m;
          return m;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("no-model");
    })();
  }
  try { return await loading; }
  catch (e) { loading = null; markFailed(); throw e; }
}

/* ---------- image helpers ---------- */
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    if (!src.startsWith("data:")) i.crossOrigin = "anonymous";
    i.onload = () => res(i); i.onerror = () => rej(new Error("image-load")); i.src = src;
  });
}
// "full" = centred square of the whole photo; "head" = tighter square around the upper middle, where the face usually is.
function cropCanvas(img, view, size = 256) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const side = view === "head" ? Math.min(w, h) * 0.6 : Math.min(w, h);
  const cx = w / 2, cy = view === "head" ? h * 0.4 : h / 2;
  const sx = Math.max(0, Math.min(w - side, cx - side / 2)), sy = Math.max(0, Math.min(h - side, cy - side / 2));
  const cv = document.createElement("canvas"); cv.width = size; cv.height = size;
  cv.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return cv;
}
function normalize(v) {
  let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
// Basic fingerprint: 8x8 colour layout (works everywhere, no download).
function basicVector(canvas) {
  const s = 8, cv = document.createElement("canvas"); cv.width = s; cv.height = s;
  const g = cv.getContext("2d"); g.drawImage(canvas, 0, 0, s, s);
  const d = g.getImageData(0, 0, s, s).data, v = [];
  for (let i = 0; i < d.length; i += 4) v.push(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return normalize(v.map(x => x - mean));
}
async function aiVector(canvas) {
  const out = await extractor(canvas.toDataURL("image/jpeg", 0.92), { pool: true });
  let data = Array.from(out.data);
  const dims = out.dims || [];
  if (dims.length === 3) data = data.slice(0, dims[2]); // [1, tokens, dim] -> first (CLS) token
  return normalize(data);
}

// Which fingerprints a post is missing (given the ones already saved).
export function missingWork(theCase, saved) {
  const photos = (theCase.photos || []).slice(0, aiSettings().maxPhotos);
  const have = new Set(saved.map(r => `${r.model}|${r.photo_index}|${r.crop}`));
  const needBasic = [], needAI = [];
  photos.forEach((_, i) => ["full", "head"].forEach(crop => {
    if (!have.has(`${BASIC_MODEL}|${i}|${crop}`)) needBasic.push([i, crop]);
    if (aiSettings().enabled && !have.has(`${preferredModel()}|${i}|${crop}`)) needAI.push([i, crop]);
  }));
  return { needBasic, needAI, photos };
}

// Make the missing fingerprints for a post. Always returns what it could make; never throws.
// onStatus({stage, n, total, pct}) lets the page show progress.
export async function computeFingerprints(theCase, saved, onStatus = () => {}) {
  const { needBasic, needAI, photos } = missingWork(theCase, saved);
  const rows = [];
  let aiError = null;
  if (!needBasic.length && !needAI.length) return { rows, aiError, aiModel: preferredModel() };

  let model = null;
  if (needAI.length) {
    try { onStatus({ stage: "loading", pct: 0 }); model = await loadAI(pct => onStatus({ stage: "loading", pct })); }
    catch (e) { aiError = e; }
  }
  const imgs = {};
  const getImg = async i => (imgs[i] = imgs[i] || await loadImage(photos[i]));
  const todo = [...new Set([...needBasic, ...(model ? needAI : [])].map(([i]) => i))];
  for (let k = 0; k < todo.length; k++) {
    const i = todo[k];
    onStatus({ stage: "analysing", n: k + 1, total: todo.length });
    let img;
    try { img = await getImg(i); } catch (e) { continue; } // photo could not be read: skip it, try again next time
    for (const crop of ["full", "head"]) {
      const cv = cropCanvas(img, crop);
      if (needBasic.some(([a, b]) => a === i && b === crop)) {
        try { rows.push({ photo_index: i, crop, model: BASIC_MODEL, v: basicVector(cv) }); } catch (e) { /* e.g. tainted canvas */ }
      }
      if (model && needAI.some(([a, b]) => a === i && b === crop)) {
        try { rows.push({ photo_index: i, crop, model, v: await aiVector(cv) }); }
        catch (e) { aiError = e; }
      }
      await new Promise(r => setTimeout(r, 0)); // let the page breathe between images
    }
  }
  if (aiError) markFailed();
  return { rows, aiError, aiModel: model };
}
