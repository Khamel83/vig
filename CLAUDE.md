<!-- ONE_SHOT v6.0 -->
# IMPORTANT: Read AGENTS.md - it contains skill and agent routing rules.
#
# Skills (synchronous, shared context):
#   "build me..."     → front-door
#   "plan..."         → create-plan
#   "implement..."    → implement-plan
#   "debug/fix..."    → debugger
#   "deploy..."       → push-to-cloud
#   "ultrathink..."   → thinking-modes
#   "beads/ready..."  → beads (persistent tasks)
#
# Agents (isolated context, background):
#   "security audit..." → security-auditor
#   "explore/find all..." → deep-research
#   "background/parallel..." → background-worker
#   "coordinate agents..." → multi-agent-coordinator
#
# Always update TODO.md as you work.
<!-- /ONE_SHOT -->
# CLAUDE.md - The Vig

**The Vig** - Cloudflare-native prediction pool framework for friends.

Domain: `khamel.com/nfl`, `khamel.com/nba`, etc.

---

## Project Status

**Phase**: MVP Complete - NBA26 pool live at `khamel.com/nba26`

**Live Deployments:**
- **NBA26 Pool**: `https://khamel.com/nba26` (10 players, snake draft, auto-synced standings)
- **Auto-sync**: Every 3 hours via Cloudflare Cron (vig-sync worker)
- **Route**: khamel.com/nba26 → vig-6dw.pages.dev/nba26 (via Poytz redirector)

**Target**: $0/month FOREVER (not just MVP)

---

## Stack

| Component | Technology |
|-----------|------------|
| Frontend | Astro + React (islands) |
| Backend | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) |
| Real-time | Cloudflare Durable Objects (WebSocket) |
| Cache | Cloudflare KV |
| Jobs | Cloudflare Queues |
| Storage | Cloudflare R2 |
| Email | Resend |
| Sports API | TheRundown |

---

## Quick Commands

```bash
# Local development (with local D1)
wrangler pages dev dist --local --kv=KV --d1=DB

# Local development (with remote D1 for testing)
wrangler pages dev dist --remote --kv=KV --d1=DB

# Deploy to Cloudflare Pages
npm run build
wrangler pages deploy dist --project-name=vig

# Run D1 migrations
wrangler d1 execute vig-db --file=migrations/0001_initial.sql

# Interactive D1 console
wrangler d1 execute vig-db --command="SELECT * FROM events"
```

---

## Database (D1)

**Always use prepared statements** - no SQL injection in friends pools.

```typescript
// src/lib/db.ts
const stmt = env.DB.prepare("SELECT * FROM users WHERE email = ?");
const result = await stmt.bind(email).first();
```

**D1 is SQLite at edge** - fast reads, writes go through primary.

---

## Real-time (Durable Objects)

**WebSocket endpoint**: `/ws/leaderboard`

Each event gets its own Durable Object instance. Clients connect, subscribe to event, receive live updates.

```typescript
// functions/ws/leaderboard.ts
export class LeaderboardDO {
    // See PLAN.md for full implementation
}
```

---

## Path Routing

```
khamel.com/           → Landing (events list)
khamel.com/nfl-2025   → NFL Wins Pool 2025
khamel.com/nba-allstar → NBA All-Star
khamel.com/admin      → Admin dashboard
```

Handled by Astro file-based routing + Cloudflare Pages Functions for API.

---

## Auth

- **Method**: Password + JWT (no magic links)
- **Persistence**: Long-lived tokens in localStorage ("never sign out")
- **Storage**: Sessions in KV + D1 (for queries)

Reuse patterns from networthtennis.com (adapted for Workers).

---

## Pool Types (Flexible)

**Primary**: Wins pools (NFL, NBA) - pick teams, count wins

**Planned**: Squares pool (Super Bowl) - 10x10 grid

**Strategy**: JSON `prediction_data` column handles all types:

```javascript
// Wins pool
{ teams: ["KC", "BUF", "DET"] }

// Squares pool
{ square: { row: 3, col: 7 } }

// Future: bracket
{ bracket: { ... } }
```

---

## Email (Resend)

**3,000 free/month** - enough for small friend groups.

- Password resets
- Pool invites
- Event completion notifications

Templates ported from networthtennis.com.

---

## Sports Data (TheRundown)

**Free tier**: 1,000 requests/month

**WebSocket**: `wss://therundown.io/api/v1/ws` - real-time scores

**Delta endpoint**: Efficient polling fallback

---

## Environment Variables

Set in Cloudflare dashboard (not .env):

```bash
# Cloudflare (auto-bound via wrangler.toml)
DB=<D1_BINDING>
KV=<KV_BINDING>
LEADERBOARD=<DO_BINDING>
QUEUE=<QUEUE_BINDING>

# External APIs
THE_RUNDOWN_API_KEY=
RESEND_API_KEY=

# Site
SITE_URL=https://khamel.com
ADMIN_EMAIL=
```

---

## Code Reuse from networthtennis

| File | Adapts To | Changes |
|------|-----------|---------|
| `api/auth.py` | `functions/api/auth.ts` | Password hashing → Web Crypto, Supabase → D1 |
| `api/supabase_http.py` | `src/lib/db.ts` | Supabase client → D1 prepared statements |
| `api/email.py` | `functions/api/email.ts` | Keep templates, send via Resend |
| `public/login.html` | `src/pages/login.astro` | Convert to Astro component |
| `vercel.json` | `wrangler.toml` | Migrate config to Cloudflare |

---

## Critical Rules

**NEVER**:
- Write SQL directly without prepared statements
- Expose API keys in client code
- Use Vercel/Superbase patterns (we're Cloudflare-native)
- Skip D1 prepared statements (different syntax than Supabase)

**ALWAYS**:
- Use wrangler for local dev with remote bindings
- Test D1 queries in wrangler console first
- Keep WebSocket connections per event (not global)
- Use KV for cache, D1 for source of truth

---

## Full Plan

See `PLAN.md` for:
- Database schema
- Project structure
- Implementation phases
- Verification strategy

---

## References

- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Astro + Cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [TheRundown API](https://therundown.io/api)
