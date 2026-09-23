# The Vig - Handoff

**Date**: 2026-01-24
**Status**: MVP Deployed, awaiting user setup

---

## What's Done

### Infrastructure
- Astro + Cloudflare Pages project deployed
- D1 database created (`vig-db`: `abd188fa-f8a2-4f4e-8802-4ac89e50bd37`)
- KV namespace created (`5820f7111a914fa5978f72f1f7591338`)
- All secrets set via `wrangler pages secret put`
- Live at: https://vig-6dw.pages.dev/vig/

### Features Complete
1. **Auth System** - Password + JWT (register, login, logout, me)
2. **Event CRUD** - Admin can create/manage events
3. **Selection Flow** - Users can pick teams for events
4. **Sports API** - TheRundown integration with NFL + NBA team data
5. **Seed Teams** - Admin endpoint to populate teams for NFL/NBA events

### Recent Changes
- App now lives at `/vig` base path (hidden from khamel.com root)
- Added `robots.txt` + noindex meta (not searchable by Google)
- Added NBA team data with real TheRundown IDs
- Encrypted secrets stored at `.env.encrypted`

---

## What's Left

### Immediate (For NBA Pool)
1. **Create NBA 2026 event** via admin dashboard or API
2. **Seed NBA teams** - `POST /api/admin/seed-teams?event=nba-2026`
3. **Create 10 users** with the Gmail accounts provided:
   - adam, whet, mzapp, omar, pete, ben, carter, eric, mintz, mcard
4. **Import their picks**:
   ```
   adam: OKC, TOR, NO
   whet: CLE, BOS, BKN
   mzapp: NYK, DAL, WSH
   omar: DEN, PHI, POR
   pete: HOU, MIL, PHX
   ben: ORL, IND, SAC
   carter: GS, ATL, UTAH
   eric: LAC, MEM, MIA
   mintz: MIN, LAL, CHI
   mcard: DET, SA, CHA
   ```

### Pending Features
1. **Google OAuth** - User requested but not implemented yet
2. **Live Scores** - TheRundown sync works but not scheduled
3. **Durable Objects** - Real-time leaderboard needs separate Worker deploy

### Integration with khamel.com
The app is configured for `/vig` base path. To make it work:
- Option A: Deploy as subdomain (vig.khamel.com)
- Option B: Use Cloudflare route rules to proxy `/vig/*` to this Pages project

---

## Quick Commands

```bash
# Local dev
npm run dev

# Deploy
npm run build && wrangler pages deploy dist --project-name=vig

# Run migrations on D1
wrangler d1 execute vig-db --file=migrations/0001_initial.sql

# Seed teams for an event
curl -X POST "https://vig-6dw.pages.dev/api/admin/seed-teams?event=nba-2026" \
  -H "Authorization: Bearer <admin-jwt>"
```

---

## Secrets

`.env.encrypted` is the SOPS source for `CLOUDFLARE_API_TOKEN`,
`THE_RUNDOWN_API_KEY`, `JWT_SECRET`, and `RESEND_API_KEY`. Never put their
values in documentation, chat, logs, or Git. The Cloudflare token has ID
`e89e78734e0ff766b7294761c8b1ee7a`, is for Vig Pages/D1 deployment,
and was rolled on 2026-09-23 after its old value was found in this file.
Decrypt only to a protected local runtime file when needed. The other three
values were also present in the old committed handoff and require separate
provider/runtime rotation; removing them from this file does not erase Git
history.
