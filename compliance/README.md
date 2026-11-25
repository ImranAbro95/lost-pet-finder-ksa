# PDPL compliance pack – Lost Pet Finder KSA

Version 2026-11-24. These documents show how the site meets Saudi Arabia's Personal Data Protection Law (PDPL) and its Implementing Regulations. They are written to be kept up to date by the operator and, later, by the Compliance agent.

**This is not legal advice.** It was prepared from secondary legal sources (law-firm and compliance-firm summaries) because the official texts could not all be read online during preparation. Have a Saudi-qualified lawyer review it before a wide public launch.

| File | What it is |
| --- | --- |
| `ropa.md` | Record of processing activities (what data, why, legal basis, recipients, retention, transfers) |
| `retention.md` | How long each kind of data is kept and how it is destroyed |
| `rights-requests.md` | How requests for access, copy, correction, deletion and consent withdrawal are handled (30 days) |
| `breach-runbook.md` | What to do in the first 72 hours after a data breach |
| `transfer-assessment.md` | Risk assessment for storing data on servers outside Saudi Arabia |
| `launch-checklist.md` | What must be done before going live, including open legal questions |

## How the site itself complies (built in)

| PDPL requirement | Where it is in the site |
| --- | --- |
| Notice before collection, plain language, Arabic and English | `legal.js` (Privacy notice), shown on sign-in and before first post |
| Consent: informed, per purpose, provable, withdrawable | Consent screen + `consents` table (purpose, version, time); separate tick for public WhatsApp; per-post consent; delete post/account to withdraw |
| Right to be informed | Privacy notice page |
| Right of access and copy | My account → Download my data (JSON) |
| Right to correction | Edit post |
| Right to destruction | Delete post; Delete my account (removes photos, posts, messages, marks, fingerprints, profile) |
| Data minimisation | Only Google email kept for sign-in, never shown; no names, no tracking or advertising cookies |
| Retention | Daily database job (`schema.sql` section 8) |
| Security | Database row-level security, admin-only moderation, blocking, encrypted connections |
| Accountability | `privacy_log` table (accept, export, delete actions), this pack |
| Minors | 18+ confirmation; under-18s asked to have a parent post |
