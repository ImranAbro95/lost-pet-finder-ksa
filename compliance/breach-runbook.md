# Data breach runbook (first 72 hours)

A breach is any leak, loss, unauthorised access to, or unauthorised change of personal data (for example: a leaked admin password, the Supabase service key published by mistake, a database rule that exposed private messages).

**Clock: notify SDAIA within 72 hours of becoming aware**, where the breach may harm people or their rights. (Draft 2026 amendments propose notifying every breach within 72 hours; follow that if adopted.) Notify affected people without undue delay where it could harm them.

## Hour 0–4: contain
- Change passwords for Google, GitHub, Supabase and Cloudflare; turn on 2-step verification.
- If a key leaked: Supabase → Project Settings → API → roll (regenerate) the keys, then update `config.js`.
- If a rule was wrong: fix it in SQL, or temporarily set posts to hidden.
- Write down what happened, when you found out, and what you did (time-stamped).

## Hour 4–48: assess
- What data, how many people, since when, who could see it.
- Is it likely to harm anyone (scams using WhatsApp numbers, exposed messages)?

## Within 72 hours: notify
- **SDAIA**: through the National Data Governance Platform (dgp.sdaia.gov.sa → Personal Data Breach Notification). Include: what happened, when, data and people affected, likely consequences, steps taken, contact person. If details are still missing, send what you have and add the rest later with reasons.
- **Affected users**: plain-language message in Arabic and English (in-site banner, and email to their Google address): what happened, what it means for them, what we did, what they should do (for example, watch for scam messages), how to contact us.

## After
- Fix the root cause, update this pack, and keep the incident record.
- Ask Supabase (processor) for their incident details if the breach was on their side; their terms require them to inform you.
