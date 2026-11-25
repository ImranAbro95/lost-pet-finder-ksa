# Record of processing activities (ROPA)

Controller: [operator name], operator of Lost Pet Finder KSA. Contact: [contact email]. Version 2026-11-24.
Keep this record for as long as the processing continues and for 5 years after each activity ends. Update it whenever a purpose, data type, recipient or region changes.

| # | Activity | Personal data | Data subjects | Purpose | Legal basis | Recipients / processors | Transfer outside KSA | Retention |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Accounts and sign-in | Google email, account ID, sign-in times | Users who post or message | Identify users, prevent fake posts and scams | Consent (sign-up) | Supabase (auth), Google (sign-in) | Yes: Supabase region [region]; Google | Until account deletion |
| 2 | Lost/found posts | Pet photos, description, district/city, optional map pin, date, optional reward, optional WhatsApp number | Posters | Publish posts and match lost with found pets | Consent (per post; separate consent for WhatsApp) | Public; Supabase (database, storage); Cloudflare (hosting) | Yes: Supabase region | Open 120 days, then closed; deleted 365 days after creation once closed; or on deletion by user |
| 3 | Private messages | Message text, sender/recipient account IDs, time | Posters and people contacting them | Let people contact each other without sharing phone numbers | Consent (sign-up) | Sender and recipient; moderators only when reported; Supabase | Yes | 365 days, or on account deletion |
| 4 | Photo fingerprints | Numbers derived from pet photos (made on the user's device) | Posters (indirectly) | Photo matching | Consent (per post) | Supabase | Yes | Deleted with the post |
| 5 | Match marks | Which matches a user marked seen/possible/not | Posters | Personal tracker | Consent (sign-up) | Supabase | Yes | Deleted with the post or account |
| 6 | Reports (flags) | Reason text, reporter ID, time | Reporters | Moderation and safety | Consent (sign-up) | Moderators; Supabase | Yes | 365 days |
| 7 | Consent records | Purpose, version, time | Users | Prove consent | Legal obligation / accountability | Supabase | Yes | Until account deletion |
| 8 | Privacy action log | Account ID (unlinked after deletion), action, time | Users | Accountability for rights requests | Legal obligation / accountability | Admin; Supabase | Yes | 5 years |
| 9 | Visit statistics | None stored about the person: Cloudflare Web Analytics counts page views, country and device type in total, without cookies or fingerprinting | Visitors | Know whether the service is used and which pages help | Legitimate interest / no personal data retained by us | Cloudflare | Yes (Cloudflare network) | Cloudflare keeps aggregate statistics; nothing is stored by us |
| 10 | Abuse protection | Number of posts, messages and reports per account in the last 24 hours; public text checked for phone numbers (not stored) | Users who post or message | Prevent spam and scams | Consent (sign-up, Terms) | Supabase | Yes: Supabase region | Uses existing records only; nothing extra stored |

Not processed: sensitive data (health, religion, etc.), credit data, children's data (18+ only), advertising or tracking data, location tracking (only an optional pin chosen by the user).

Security measures: row-level security on every table; only owners edit their data; only admins moderate; photo files in per-user folders; HTTPS everywhere; no service key in the website; admin accounts limited to the operator.
