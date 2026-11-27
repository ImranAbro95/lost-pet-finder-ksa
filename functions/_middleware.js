// Cloudflare Pages Function (free plan): makes the link-preview tags on the home page use full addresses
// (https://your-site/og.png), which WhatsApp, X and Facebook need. Runs only for "/" and "/index.html" (see _routes.json).
// Cloudflare does not promise to add the _headers file to pages that pass through a Function, so the same security
// headers are added here as well. Keep them in step with _headers (QA checks this).
export const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://tile.openstreetmap.org https://cdnjs.cloudflare.com https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co https://nominatim.openstreetmap.org https://cloudflareinsights.com; worker-src 'self' blob:; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
};

export async function onRequest({ request, next }) {
  const res = await next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const origin = new URL(request.url).origin;
  const out = new HTMLRewriter().on("meta[data-abs]", {
    element(el) { const v = el.getAttribute("content") || "/"; if (v.startsWith("/")) el.setAttribute("content", origin + v); el.removeAttribute("data-abs"); },
  }).transform(res);
  const withHeaders = new Response(out.body, out);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!withHeaders.headers.has(k)) withHeaders.headers.set(k, v);
  return withHeaders;
}
