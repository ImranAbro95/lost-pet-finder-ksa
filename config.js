// Lost Pet Finder KSA – settings.
// Paste your Supabase "Project URL" and the "anon public" key (Project Settings > API Keys > Legacy API keys),
// or the new "sb_publishable_..." key. Never a service_role or sb_secret_ key.
// Both are safe to publish: the database rules in supabase/schema.sql decide what anyone can read or write.
// While these are empty, the site runs in DEMO MODE: everything is saved only in your own browser.
window.LPF_CONFIG = {
  supabaseUrl: "https://bpgplywscvfwfqdhwgfk.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwZ3BseXdzY3Zmd2ZxZGh3Z2ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MDMxODcsImV4cCI6MjExMTE3OTE4N30.hRSRX05Y25wYalz3j3G0sEd7IuEcD4q2p29_BRGMSps",
  // The public address of the site once it is online, used in posters and share links (optional).
  siteUrl: "https://lost-pet-finder-ksa.pages.dev",
  // Shown in the Privacy notice (PDPL: who runs the service and how to reach them). Fill these in before launch.
  operatorName: "Lost Pet Finder",
  contactEmail: "imranabro095@hotmail.com",
  dataRegion: "Frankfurt, Germany",
  // Visit statistics without cookies (optional). Easiest: Cloudflare Pages > your project > Metrics > Web Analytics > Enable,
  // and leave this empty. Only fill it in if you set up Web Analytics by hand and Cloudflare gave you a token.
  analyticsToken: "",
  // AI photo matching. Runs free on the visitor's device; the model downloads once and is then cached.
  ai: { enabled: true, model: "Xenova/dinov2-small", fallbackModel: "Xenova/clip-vit-base-patch32", maxPhotos: 3 }
};
