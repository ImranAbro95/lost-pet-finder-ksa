# Retention and destruction schedule

| Data | Kept for | How it is destroyed |
| --- | --- | --- |
| Open post | 120 days, then automatically closed | Daily database job (`lpf-retention`) |
| Closed, reunited or hidden post (with fingerprints and marks) | Deleted 365 days after it was created | Daily database job; photo files: see below |
| Private messages | 365 days | Daily database job |
| Reports (flags) | 365 days | Daily database job |
| Account, profile, consents | Until the user deletes the account | "Delete my account" removes everything linked to it, photo files first |
| Privacy action log | 5 years | Daily database job |
| Post photos (files) | With the post | Removed when the user deletes a post or account. Files of posts deleted by the daily job must be removed in the monthly clean-up (see below). |

**Monthly clean-up (operator or Compliance agent):** in Supabase → Storage → `pet-photos`, remove folders of users who no longer exist and files not used by any post. A later version of the admin page will automate this.

Backups: Supabase free plan keeps short-term backups; deleted data disappears from them when they roll over. State this if anyone asks.
