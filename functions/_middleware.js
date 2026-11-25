// Cloudflare Pages Function (free plan): makes the link-preview tags on the home page use full addresses
// (https://your-site/og.png), which WhatsApp, X and Facebook need. Runs only for "/" and "/index.html" (see _routes.json).
export async function onRequest({ request, next }) {
  const res = await next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const origin = new URL(request.url).origin;
  return new HTMLRewriter().on("meta[data-abs]", {
    element(el) { const v = el.getAttribute("content") || "/"; if (v.startsWith("/")) el.setAttribute("content", origin + v); el.removeAttribute("data-abs"); },
  }).transform(res);
}
