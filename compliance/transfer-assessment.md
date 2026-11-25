# Transfer risk assessment: data stored outside Saudi Arabia

Version 2026-11-24. Complete before launch and keep with this pack.

**What is transferred:** account email and ID, post content (pet photos, area, optional WhatsApp number), private messages, consent records. No sensitive data, no credit data, no children's data.

**Where:** Supabase (database, storage, authentication), region: [region chosen]. Google (sign-in). Cloudflare (website hosting; serves the site, does not store the database).

**Why it is needed:** the service is free and has no Saudi-hosted option on free plans. Only the minimum data needed to run the service is transferred (data minimisation).

**PDPL route (to confirm with a lawyer):**
- Transfers are allowed for listed purposes, including providing a service or benefit to the data subject, if they do not harm national security or vital interests, and data is minimised.
- SDAIA has not published an adequacy list; prefer a region in a jurisdiction with strong data protection (for example the EU, such as Frankfurt), and record why.
- Safeguards: Saudi Standard Contractual Clauses (SCCs) published with the updated Transfer Regulations, or the processor's own data processing agreement plus this assessment. Check whether Supabase will sign the Saudi SCCs; if not, record the processor's DPA and security commitments.
- Keep this risk assessment: purpose, data, safeguards, recipient country, minimisation.

**Risks and mitigations**
| Risk | Mitigation |
| --- | --- |
| Foreign access to data | EU region; minimal data; no sensitive data |
| Processor breach | Supabase security commitments; breach runbook |
| Law change: draft 2026 amendment (Art. 23) proposes storing personal data inside the Kingdom; draft Art. 34 proposes registration for offshore transfers | Track the amendments; if adopted, move to a Saudi-hosted database (e.g. Google Cloud Dammam or Oracle Jeddah/Riyadh) and register with SDAIA if required |

Decision: [approve / revise], date, signed by [operator].
