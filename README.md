# Lost Pet Finder KSA – free setup guide

A free website, in Arabic and English, where people in Saudi Arabia post lost and found pets and get matched.
It runs on free plans only: **GitHub** (stores the code), **Supabase** (database, photos, sign-in) and **Cloudflare Pages** (puts the site online).

Until step 3 is done, the site runs in **demo mode**: everything you post is saved only in your own browser.

---

## Step 1 – GitHub: put the code online (5 minutes)

1. Go to https://github.com and create a free account.
2. Click **+** (top right) → **New repository**. Name: `lost-pet-finder-ksa`. Choose **Public**. Click **Create repository**.
3. On the new page click **uploading an existing file**. Unzip the download and drag in **everything inside the `lostpet` folder**, including the folders `functions`, `icons`, `supabase`, `compliance` and `tests` (not the zip itself). Click **Commit changes**.

## Step 2 – Supabase: the database (7 minutes)

1. Go to https://supabase.com → **Start your project** → sign in with GitHub.
2. **New project**. Name: `lost-pet-finder`. Choose a strong database password (save it). Region: an EU region such as **Frankfurt** (strong data protection, see the compliance pack). Plan: **Free**. Create.
3. When it is ready, open **SQL Editor** → **New query**. Open the file `supabase/schema.sql`, copy everything, paste it, and press **Run**. You should see "Success".
4. Write down the region you chose: it goes in `config.js` and the compliance pack.
5. Open **Project Settings** → **API Keys** → tab **Legacy API keys** and copy the **anon public** key. The **Project URL** is under **Project Settings** → **Data API** (or the **Connect** button). If your project shows only a new `sb_publishable_…` key, use that instead.

## Step 2b – Turn on "Continue with Google" (10 minutes, free)

1. Go to https://console.cloud.google.com → project picker at the top → **New project** → name `lost-pet-finder` → **Create**, then select it.
2. Search for **Google Auth Platform** (it may be shown as **OAuth consent screen**) → **Get started**: app name "Lost Pet Finder KSA", user support email = your email, audience **External**, contact email = your email → **Create**.
3. **Clients** → **Create client** → type **Web application**, name "Lost Pet Finder web".
   Under **Authorised redirect URIs** → **Add URI** → paste `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (Supabase shows this exact address on its Google provider page, step 4). **Create**, then copy the **Client ID** and **Client secret**.
4. In Supabase → **Authentication → Sign In / Providers → Google**: switch on, paste the Client ID and secret, **Save**.
5. Back in Google → **Audience** → **Publish app** (so anyone can sign in, not only test users). Only basic profile and email are used, so Google does not need to review the app.
6. In Supabase, make sure **Allow anonymous sign-ins** is off (Authentication → Sign In / Providers).

## Step 3 – Connect the site to the database (2 minutes)

1. In your GitHub repository, open `config.js` → click the **pencil** (Edit).
2. Paste the Project URL between the quotes of `supabaseUrl`, and the anon key between the quotes of `supabaseAnonKey`.
   Also fill `operatorName` (your name), `contactEmail` (an inbox you check for privacy requests) and `dataRegion` (e.g. "Frankfurt, Germany"). These appear in the Privacy notice, as the law requires.
3. Click **Commit changes**.

The anon key is meant to be public; the rules in `schema.sql` protect the data. Never paste the **service_role** key or any `sb_secret_…` key anywhere in the site.

## Step 4 – Cloudflare Pages: go live (5 minutes)

1. Go to https://dash.cloudflare.com/sign-up and create a free account.
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → choose GitHub and allow access to `lost-pet-finder-ksa`.
3. Build settings: Framework preset **None**, Build command **empty**, Build output directory **/** . Click **Save and Deploy**.
4. After about a minute you get an address like `https://lost-pet-finder-ksa.pages.dev`. Open it: the yellow "Demo mode" bar should be gone.
5. Back in GitHub, edit `config.js` once more and put that address in `siteUrl` (used on posters and share links). Cloudflare updates the site by itself after every commit.
6. In Supabase → **Authentication** → **URL Configuration**, set **Site URL** to the same address and add it under **Redirect URLs** (needed for Google sign-in to return to your site).
7. **Visit statistics (no cookies):** in Cloudflare → your Pages project → **Metrics** → **Web Analytics** → **Enable**. Nothing else to do.
8. **Check the link preview:** open a post, tap **Copy link** (it looks like `https://…pages.dev/p/…`) and paste it in a WhatsApp chat to yourself. You should see the pet's photo and title. The home page link shows the site's own preview image.
9. Sign in on the site once with your Google account and accept the privacy notice. Then in Supabase → **SQL Editor**, run the last line of `schema.sql` with your email to make yourself the moderator. A **Moderation** button appears in My account.

## Keeping it healthy (free)

- **Supabase pauses free projects after 7 days without activity.** Normal use keeps it awake; if it pauses, open the project and click **Resume project**.
- **Reports from visitors** ("Report this post") land in the `flags` table: Supabase → **Table Editor** → `flags`. Delete a bad post in the `cases` table.
- **Photos**: the free plan holds 1 GB (several thousand photos; they are shrunk before upload).
- **PDPL compliance**: read `compliance/launch-checklist.md` before launch. The `compliance` folder holds the records the law expects (processing record, retention, rights requests, breach runbook, transfer assessment).
- **Spam limits (built in)**: each person can make 5 posts, send 40 messages and file 10 reports per 24 hours, and phone numbers typed into public text are refused (they must go in the WhatsApp field, which needs its own consent tick). The admin account is not limited. Change the numbers in section 10 of `schema.sql` and in `guard.js`.
- **Spam**: if fake posts still appear, switch on CAPTCHA in Supabase → Authentication → Attack Protection (free with Cloudflare Turnstile).

## What is in this folder

| File | What it does |
| --- | --- |
| `index.html`, `styles.css` | The page and its look (light and dark, Arabic right-to-left) |
| `app.js` | Screens: home, browse, report, post page, my posts, messages |
| `i18n.js` | All text in English and Arabic, cities and Riyadh districts |
| `match.js` | Matching rules (animal, distance, date, colours, eyes, sex, breed) |
| `poster.js` | Poster maker drawing: A4 / A5 print with tear-off phone strips, square post and status/story image, Arabic + English, QR code. Runs in the browser; photos are never uploaded |
| `icons.js` | Icon set and the home-page illustration |
| `legal.js` | Privacy notice and terms in Arabic and English (PDPL) |
| `compliance/` | PDPL records and procedures |
| `ai.js` | AI photo matching (pet face and coat recognition) with self-healing fallback |
| `data.js` | Talks to Supabase, or to the browser in demo mode |
| `supabase/schema.sql` | Database tables, privacy rules and photo storage |
| `config.js` | Your Supabase keys and site address |
| `guard.js` | Spam limits and the phone-number filter for public text |
| `sw.js`, `manifest.webmanifest`, `icons/` | "Add to home screen" (installable app) and offline start |
| `og.png` | The picture shown when the site link is shared in WhatsApp, X, Facebook or Telegram |
| `functions/`, `_routes.json` | Two small free Cloudflare functions: link previews for each post (`/p/<id>`) and full addresses for the home-page preview |

## AI photo matching (free)

- When someone posts a **lost** pet, the site compares its photos with every **found** pet photo (and the other way round), using an image-recognition AI model (DINOv2; CLIP as a backup) that runs **on the visitor's own phone or computer**. No paid AI service is used.
- Each photo is studied twice, the whole animal and a close-up of the head, so the face, coat pattern and colours all count.
- The result shows as **"Photo xx%"** on each match and raises the match score. Photos only ever raise a score, never lower it.
- **Self-healing:** if the AI cannot start (old phone, slow data), the post is still published with a basic photo fingerprint, and the AI fingerprints are made automatically the next time the owner opens the site. Older posts and posts made with an older AI model are upgraded the same way.
- The first time, the AI model downloads once (tens of MB) and is then cached by the browser.
- To switch it off, set `ai: { enabled: false }` in `config.js`.
- If you set up the database before this feature existed, run `supabase/schema.sql` again (it is safe to re-run).

## Next features (planned)

- Hourly search of Haraj, Telegram and expatriates.com for every open lost report, results shown under "Posts found on other sites".
- Telegram bot alerts for new matches.
