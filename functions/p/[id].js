// Cloudflare Pages Function (free plan): share links like https://your-site/p/<post id>.
// Chat apps read the title, text and photo of the post from this page; people are sent straight on to the post (#case-<id>).
// Only public posts are read (the database rules hide removed posts), and no phone number is ever put in the preview.

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
import { STRINGS, CITIES } from "../../i18n.js";

async function settings(env, request) {
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) return { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY };
  try { // fall back to the public config.js, so no extra setup is needed
    const txt = await (await env.ASSETS.fetch(new URL("/config.js", request.url))).text();
    const pick = k => (txt.match(new RegExp(k + '\\s*:\\s*"([^"]*)"')) || [])[1] || "";
    return { url: pick("supabaseUrl"), key: pick("supabaseAnonKey") };
  } catch (e) { return { url: "", key: "" }; }
}

export async function onRequestGet({ params, request, env }) {
  const id = String(params.id || "");
  const origin = new URL(request.url).origin;
  const target = `${origin}/#case-${encodeURIComponent(id)}`;
  let c = null;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const { url, key } = await settings(env, request);
    if (url && key) {
      try {
        const r = await fetch(`${url.replace(/\/$/, "")}/rest/v1/cases?id=eq.${id}&select=kind,species,pet_name,breed,colors,district,city,event_date,photos,status`,
          { headers: key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key }, cf: { cacheTtl: 300 } });
        if (r.ok) c = (await r.json())[0] || null;
      } catch (e) { /* show the general preview */ }
    }
  }
  let title = "Lost Pet Finder KSA – مفقودات الحيوانات الأليفة", desc = "Lost or found a pet in Saudi Arabia? Post it free. فقدت حيوانك أو وجدت حيواناً؟ انشره مجاناً.", image = origin + "/og.png";
  if (c) {
    const sp = [STRINGS.en[c.species] || "pet", STRINGS.ar[c.species] || "حيوان أليف"];
    const ct = CITIES.find(x => x.id === c.city), city = ct ? [ct.en, ct.ar] : [c.city || "", c.city || ""];
    const name = c.pet_name || c.breed || "";
    const lost = c.kind === "lost";
    const head = c.status === "reunited" ? "REUNITED" : lost ? "LOST" : "FOUND";
    const headAr = c.status === "reunited" ? "عاد إلى أهله" : lost ? "مفقود" : "معثور عليه";
    title = `${head} ${sp[0].toUpperCase()}${name ? ": " + name : ""} – ${[c.district, city[0]].filter(Boolean).join(", ")} | ${headAr}: ${sp[1]}`;
    desc = `${[c.breed, c.colors].filter(Boolean).join(" · ")}${c.event_date ? " · " + c.event_date : ""}. ${lost ? "Have you seen this pet? Tap to see photos and contact the owner privately." : "Is this your pet? Tap to see photos and contact the finder privately."}`;
    const photo = (c.photos || []).find(p => typeof p === "string" && p.startsWith("https://"));
    if (photo) image = photo;
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Lost Pet Finder KSA">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(origin + "/p/" + id)}">
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<link rel="canonical" href="${esc(target)}"><meta http-equiv="refresh" content="0; url=${esc(target)}">
</head><body style="font-family:sans-serif;padding:24px"><p><a href="${esc(target)}">Open the post · افتح المنشور</a></p>
<script>location.replace(${JSON.stringify(target)});</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
}
