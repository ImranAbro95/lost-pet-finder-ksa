# Launch checklist (PDPL and safety)

## Must do before going live
- [ ] Fill in `config.js`: `operatorName`, `contactEmail` (an inbox you check), `dataRegion` (your Supabase region).
- [ ] Choose a Supabase region in a strong data-protection jurisdiction (for example Frankfurt, EU) and record it in `transfer-assessment.md`.
- [ ] Complete and sign `transfer-assessment.md`.
- [ ] Turn on 2-step verification for Google, GitHub, Supabase and Cloudflare.
- [ ] Run `supabase/schema.sql` and make yourself admin (last lines of the file).
- [ ] Check the daily retention job exists: Supabase → Database → Cron (or `select * from cron.job;`).
- [ ] Have a native Arabic speaker read the Privacy notice and Terms (`legal.js`).
- [ ] Test: sign in, post, edit, download my data, delete post, delete account.
- [ ] Turn on Cloudflare Web Analytics (Pages project → Metrics). It uses no cookies; the Privacy notice already says so.
- [ ] Paste a post link into WhatsApp and check that the photo preview appears.
- [ ] On an Android phone, check that "Install" appears on the home page; on iPhone, Share → Add to Home Screen.

## Ask a Saudi lawyer (open questions)
1. Must the operator register in SDAIA's National Register of Controllers? (Required today where the main activity is processing personal data or sensitive data is processed; a draft 2026 amendment would require it for any transfer outside the Kingdom.)
2. Is a Data Protection Officer required? (Likely not: no sensitive data and no large-scale systematic monitoring; confirm.)
3. Best transfer safeguard with Supabase: Saudi SCCs or another route.
4. Status of the October 2026 draft amendments (data localisation, registration, 72-hour notice for all breaches).
5. Whether a commercial registration is needed while the service is free and non-commercial.

## Keep doing after launch
- Reply to privacy emails within 30 days (`rights-requests.md`).
- Review reports in the Moderation page at least daily.
- Monthly photo clean-up (`retention.md`).
- Re-check this pack whenever a feature changes what data is collected.
