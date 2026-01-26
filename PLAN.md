# Plan: The Vig - Cloudflare-Native Prediction Pool Framework

## Project Overview

**The Vig** - A generic prediction pool framework for friends (NFL wins pools, March Madness, etc.) built entirely on Cloudflare's ecosystem.

**Key Goal:** One codebase, 100% Cloudflare, path-based routing on `khamel.com/nfl`, `khamel.com/nba`, etc.

---

## Cloudflare-First Architecture

### Why Cloudflare?

| Service | Purpose | Why |
|---------|---------|-----|
| **Cloudflare Pages** | Frontend hosting | Free, global edge deployment, Astro support |
| **Cloudflare Workers** | API/Serverless functions | Zero cold starts, edge computing |
| **Cloudflare D1** | SQLite database | Edge SQL, fast queries, free tier generous |
| **Cloudflare Durable Objects** | Real-time/WebSocket | Live leaderboards, score updates |
| **Cloudflare KV** | Cache/sessions | Fast key-value for auth tokens, config |
| **Cloudflare Queues** | Background jobs | Score polling, email sending |
| **Cloudflare R2** | File storage | Logos, assets (S3-compatible) |

### Domain Strategy

- **Primary domain**: `khamel.com` (already on Cloudflare DNS)
- **Path routing**: `/nfl`, `/nba`, `/march-madness`, etc.
- **DNS**: Already managed by Cloudflare
- **SSL**: Automatic via Cloudflare

---

## Research: Existing GitHub Projects

### Projects Found

| Project | Tech Stack | Key Insights |
|---------|------------|--------------|
| [MMPoolsV3](https://github.com/kstruck/MMPoolsV3) | React 19, TypeScript, Firebase (Firestore + Auth) | Real-time pools, squares + brackets combo |
| [SocialSlice](https://github.com/shreyan001/SocialSlice) | Unknown (web limited) | World Cup prediction pools, group payments |

### Patterns to Incorporate

1. **From MMPoolsV3**:
   - Multi-pool support (squares + brackets in one app)
   - Firebase-like real-time → **Durable Objects**
   - React/TypeScript → **Astro + islands**

2. **General Pool Patterns**:
   - JSON `prediction_data` column for flexible pool types
   - Pool factory pattern for different pool types
   - Event-driven scoring calculations

---

## Database Schema (D1 SQLite)

```sql
-- Users
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Events/Pools
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,        -- Path: "nfl-2025"
    name TEXT NOT NULL,
    description TEXT,
    sport TEXT,                       -- NFL, NBA, NCAA_FB
    status TEXT DEFAULT 'draft',      -- draft, open, active, completed
    pool_type TEXT,                   -- wins, bracket, squares, spread
    max_selections INTEGER,
    starts_at INTEGER,
    ends_at INTEGER,
    created_by TEXT REFERENCES users(id),
    config TEXT NOT NULL DEFAULT '{}'  -- JSON config for pool-specific settings
);

-- Options (teams, players, etc.)
CREATE TABLE options (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    external_id TEXT,
    name TEXT NOT NULL,
    abbreviation TEXT,
    logo_url TEXT,
    metadata TEXT DEFAULT '{}'
);

-- User Selections
CREATE TABLE selections (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    option_id TEXT REFERENCES options(id) ON DELETE CASCADE,
    prediction_data TEXT DEFAULT '{}',   -- Flexible for different pool types
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(event_id, user_id, option_id)
);

-- Games/Matches
CREATE TABLE games (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    external_id TEXT UNIQUE,
    home_team_id TEXT REFERENCES options(id),
    away_team_id TEXT REFERENCES options(id),
    home_score INTEGER,
    away_score INTEGER,
    status TEXT,
    scheduled_at INTEGER,
    metadata TEXT DEFAULT '{}',
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Standings (calculated, materialized)
CREATE TABLE standings (
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    points REAL DEFAULT 0,
    rank INTEGER,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (event_id, user_id)
);

-- Sessions (KV backup, D1 for queries)
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_events_slug ON events(slug);
CREATE INDEX idx_selections_event_user ON selections(event_id, user_id);
CREATE INDEX idx_games_event_status ON games(event_id, status);
CREATE INDEX idx_standings_event ON standings(event_id, wins DESC);
```

---

## Project Structure

```
vig/
├── src/
│   ├── components/           # Astro components (islands for interactivity)
│   │   ├── Leaderboard.astro
│   │   ├── EventCard.astro
│   │   └── SelectionGrid.astro
│   ├── pages/
│   │   ├── index.astro       # Events list
│   │   ├── login.astro
│   │   ├── [slug]/           # Event pages
│   │   │   └── index.astro
│   │   └── admin/
│   │       └── index.astro
│   ├── lib/
│   │   ├── db.ts             # D1 client
│   │   ├── auth.ts           # Session/password handling
│   │   └── email.ts          # Resend via Worker
│   └── styles/
│       └── global.css
├── functions/
│   │   # Cloudflare Pages Functions (Workers)
│   ├── api/
│   │   ├── auth.ts           # Login, register, logout
│   │   ├── events.ts         # CRUD events
│   │   ├── selections.ts     # User picks
│   │   ├── scoring.ts        # Sync scores, calculate standings
│   │   └── admin.ts          # Admin endpoints
│   └── ws/
│       └── leaderboard.ts    # Durable Object for real-time updates
├── migrations/
│   └── 0001_initial.sql      # D1 schema
├── wrangler.toml             # Cloudflare config
├── astro.config.mjs          # Astro config
└── package.json
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Astro + React Islands | Static build, interactive where needed |
| **Backend** | Cloudflare Workers | Edge computing, zero cold starts |
| **Database** | Cloudflare D1 | SQLite at edge, fast reads |
| **Real-time** | Durable Objects | WebSocket leaderboards |
| **Cache** | Cloudflare KV | Sessions, config cache |
| **Jobs** | Cloudflare Queues | Score polling, emails |
| **Storage** | Cloudflare R2 | Team logos, assets |
| **Email** | Resend (via Worker) | Transactional emails |

---

## Key Features

### 1. Path-Based Routing

```
khamel.com/           → Landing page (events list)
khamel.com/nfl-2025   → NFL Wins Pool 2025
khamel.com/nba-allstar → NBA All-Star events
khamel.com/admin      → Admin dashboard
```

### 2. Auth Persistence

- Long-lived JWT tokens stored in localStorage
- Sessions backed by KV + D1
- "Never sign out" experience

### 3. Real-Time Leaderboards

**Durable Object (WebSocket):**
```typescript
// functions/ws/leaderboard.ts
export class LeaderboardDO {
    private state: LeaderboardState;
    private sessions: Set<WebSocket>;

    async fetch(request: Request) {
        if (request.headers.get("Upgrade") === "websocket") {
            return this.handleWebSocket(await request.webSocket());
        }
    }

    private handleWebSocket(ws: WebSocket) {
        ws.accept();
        this.sessions.add(ws);

        ws.addEventListener("message", async (msg) => {
            const data = JSON.parse(msg.data);
            if (data.type === "subscribe") {
                await this.sendLeaderboard(data.eventId, ws);
            }
        });
    }

    private async broadcastUpdate(eventId: string) {
        const standings = await this.getStandings(eventId);
        for (const ws of this.sessions) {
            ws.send(JSON.stringify({ type: "update", standings }));
        }
    }
}
```

### 4. Score Sync Strategy

**Hybrid Approach:**
1. **Primary**: Durable Object WebSocket for live scores (sports API)
2. **Fallback**: Queue-triggered Worker polls every 5 min
3. **Sports API**: TheRundown (WebSocket + delta endpoint)

```typescript
// functions/api/scoring.ts
export async function GET(request: Request) {
    // Poll endpoint for queue/backup
    const events = await getActiveEvents();

    for (const event of events) {
        await syncEventScores(event);
        await recalculateStandings(event.id);
    }

    return Response.json({ synced: events.length });
}
```

---

## Wrangler Config

```toml
# wrangler.toml
name = "vig"
main = "functions/_worker.ts"
compatibility_date = "2025-01-01"

[site]
bucket = "./dist"

[[d1_databases]]
binding = "DB"
database_name = "vig-db"
database_id = "<D1_DATABASE_ID>"

[[kv_namespaces]]
binding = "KV"
id = "<KV_NAMESPACE_ID>"

[[durable_objects.bindings]]
name = "LEADERBOARD"
class_name = "LeaderboardDO"

[[queues.producers]]
binding = "QUEUE"
queue = "score-sync"

[[queues.consumers]]
queue = "score-sync"
max_batch_size = 10
max_wait_time = 5
```

---

## Implementation Phases

### Phase 1: Core Framework (Cloudflare Native)

**1.1 Project Setup**
```bash
cd /Volumes/homelab/github/vig
npm create astro@latest . -- --template minimal --install --no-git --ts strict
npx astro add react tailwind
npm install @cloudflare/workers-types
```

**1.2 D1 Database**
```bash
wrangler d1 create vig-db
wrangler d1 execute vig-db --file=migrations/0001_initial.sql
```

**1.3 Auth System**
- Password hashing (Web Crypto API)
- JWT generation/verification
- Session storage (KV + D1)
- Auto-restore on page load

### Phase 2: Pool Management

**2.1 Event CRUD**
- Admin creates events
- Sport, pool_type, dates config
- Status workflow (draft → open → active → completed)

**2.2 Selection Flow**
- Users pick teams/options
- Flexible `prediction_data` JSON for different pool types
- Auto-save on change

### Phase 3: Real-Time Scoring

**3.1 Durable Object for Leaderboards**
- WebSocket connections per event
- Broadcast updates on score changes
- Reconnection handling

**3.2 Sports API Integration**
- TheRundown WebSocket for live scores
- Queue-based polling fallback
- Delta endpoint for efficiency

### Focus: Flexible Pool Framework

**Primary Use Case**: Wins pools (NFL, NBA) - pick teams, count wins

**Planned Extensions**:
- Squares pool (Super Bowl) - 10x10 grid, random numbers
- Future: Other pool types via `pool_type` + `config` JSON

**Strategy**: Build generic `prediction_data` JSON column that can handle:
- `{ teams: ["KC", "BUF", "DET"] }` - wins pool
- `{ square: { row: 3, col: 7 } }` - squares pool
- `{ bracket: { ... } }` - future

---

### Recommendations

**Code Reuse**: Port patterns from networthtennis, but adapt for Workers
- Reuse: Auth logic, email templates, database patterns
- Rewrite: Supabase calls → D1, Vercel API routes → Workers
- Benefit: Proven UX, less thinking about "how should this work"

**Files to Port from networthtennis**:
| File | Adapts To | Changes |
|------|-----------|---------|
| `api/auth.py` | `functions/api/auth.ts` | Password hashing → Web Crypto, Supabase → D1 |
| `api/supabase_http.py` | `src/lib/db.ts` | Supabase client → D1 prepared statements |
| `api/email.py` | `functions/api/email.ts` | Keep templates, send via Resend Worker |
| `public/login.html` | `src/pages/login.astro` | Convert to Astro component |
| `vercel.json` | `wrangler.toml` | Migrate config to Cloudflare |

**Patterns to Reuse**:
- Long-lived JWT in localStorage ("never sign out")
- Session restoration on page load
- Password reset email flow
- Admin dashboard patterns

**Email**: Use Resend for transactional sending
- Cloudflare Email Routing = forwarding only (can't send programmatically)
- Resend = 3k free emails/month, simple API
- Send password resets, pool invites, completion notifications

**Sports API**: TheRundown (confirmed)
- Yes, has WebSocket for real-time: `wss://therundown.io/api/v1/ws`
- Delta endpoint for efficient polling fallback
- 1,000 free requests/month fits MVP needs

---

### Phase 4: Deployment

**4.1 Cloudflare Pages Setup**
```bash
npm run build
wrangler pages deploy dist --project-name=vig
```

**4.2 DNS Configuration**
- Already on Cloudflare (`khamel.com`)
- Add CNAME/Page rule if needed
- Path routing works automatically

**4.3 Environment Variables**
- Set in Cloudflare dashboard
- D1 database binding
- KV namespace binding
- API keys (TheRundown, Resend)

---

## Verification Strategy

### 1. Local Development
```bash
# Wrangler dev with D1 local
wrangler pages dev dist --local --kv=KV --d1=DB

# Or with remote binding for testing
wrangler pages dev dist --remote --kv=KV --d1=DB
```

### 2. Testing Checklist
- [ ] User can register/login
- [ ] Admin can create event
- [ ] User can make selections
- [ ] Leaderboard updates in real-time (WebSocket)
- [ ] Score polling works (Queue)
- [ ] Auto-freeze when event completes

### 3. Load Testing
- Simulate 10 concurrent WebSocket connections
- Test D1 query performance
- Verify Durable Object scaling

---

## Environment Variables

```bash
# Cloudflare (auto-bound)
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

## Advantages Over Original Plan

| Original | Cloudflare Native |
|----------|-------------------|
| Vercel hosting | Cloudflare Pages (faster, global) |
| Supabase (PostgreSQL) | D1 (SQLite at edge) |
| External WebSocket service | Durable Objects (built-in) |
| Vercel Cron | Cloudflare Queues |
| Multiple services | Single provider, unified billing |

---

## Cost Estimate ($0/Month Production)

**Target**: $0/month FOREVER, not just MVP

| Service | Free Tier | Expected Production Usage | Headroom |
|---------|-----------|---------------------------|----------|
| Pages | Unlimited bandwidth | ~100MB/month | ∞ |
| Workers | 100k req/day | ~5k/day (friends pool) | 20x |
| D1 | 5GB storage, 25M reads/day | ~50MB, 10k reads/day | 2500x |
| Durable Objects | 1000 objects | ~5-10 active events | 100x |
| KV | 100k reads/day | ~5k/day (sessions) | 20x |
| Queues | 1M ops/month | ~50k/month (score sync) | 20x |
| R2 | 10GB storage | ~100MB (logos) | 100x |

**Why this scales**:
- Friends pool = limited users (not public SaaS)
- D1 reads are cheap, writes are batched
- WebSocket reduces polling requests
- Static Astro frontend = zero edge compute cost

**Only cost if exceeding free tier**:
- Email (Resend): 3k free/month = enough for small group
- If needed: Use Cloudflare Email Routing for free (basic)

---

## Decisions Made

| Question | Answer |
|----------|--------|
| Email | Resend (3k free/month, transactional sending) |
| Sports API | TheRundown (WebSocket + delta, 1k free req/month) |
| Data Migration | Fresh start (no networthtennis data migration) |
| Code Reuse | Port patterns from networthtennis, adapt for Workers |

---

## Sources & References

- [MMPoolsV3 - MarchMeleePools V3](https://github.com/kstruck/MMPoolsV3)
- [SocialSlice - World Cup Prediction Pool](https://github.com/shreyan001/SocialSlice)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Astro + Cloudflare Integration](https://docs.astro.build/en/guides/deploy/cloudflare/)
- [TheRundown API](https://therundown.io/api)

---

## LIVE DEPLOYMENT: NBA26 Pool (January 2026)

### Overview
The NBA 2026 pool is **live at `https://khamel.com/nba26`** with:
- 10 players (snake draft format)
- 3 NBA teams per player
- Automatic standings updates every 3 hours
- Read-only display (no auth required)

### How It Works

**1. Routing (via Poytz)**
```
khamel.com/nba26
    ↓ (307 redirect via poytz worker)
vig-6dw.pages.dev/nba26
    ↓ (Astro page)
fetches /api/events/nba26
    ↓ (API returns data)
Renders leaderboard with live standings
```

**2. Auto-Sync (Cloudflare Cron)**
- **Worker**: `vig-sync` deployed independently
- **Schedule**: Every 3 hours (`0 */3 * * *`)
- **Function**:
  - Fetches NBA games from TheRundown API (last 7 days only)
  - Upserts games to D1 `games` table
  - Calculates standings from completed games
  - Updates `standings` table

**3. Database Schema**
```sql
-- Event (status = 'completed' for read-only)
INSERT INTO events (id, slug, name, sport, status, pool_type)
VALUES ('nba26-event', 'nba26', 'NBA 2026 Pool', 'NBA', 'completed', 'wins');

-- 10 users (adam, whet, mzapp, omar, pete, ben, carter, eric, mintz, mcard)
-- 30 NBA teams as options (using TheRundown external_id)
-- 30 selections (3 per user via snake draft)
-- Standings calculated from games table
```

**4. Team Standings Calculation**
```typescript
// Per-team wins/losses from games table
SELECT o.id,
  COUNT(CASE WHEN g.status = 'final' AND
    ((g.home_team_id = o.id AND g.home_score > g.away_score) OR
     (g.away_team_id = o.id AND g.away_score > g.home_score))
    THEN 1 END) as wins
FROM options o
LEFT JOIN games g ON (g.home_team_id = o.id OR g.away_team_id = o.id)
WHERE o.event_id = 'nba26-event'
```

### API Key Management
- **THE_RUNDOWN_API_KEY**: Set in Cloudflare Pages dashboard
- **Free tier**: 1,000 requests/month
- **Usage**: ~584 requests/day (sync last 7 days, 8x/day)
- **Headroom**: ~33 days/month (well within limits)

### Snake Draft Assignments
```
Round 1: adam→OKC, whet→CLE, mzapp→NYK, omar→DEN, pete→HOU, ben→ORL, carter→GS, eric→LAC, mintz→MIN, mcard→DET
Round 2: carter→ATL, mcard→SA, mzapp→DAL, mintz→LAL, pete→MIL, whet→BOS, eric→MEM, omar→PHI, ben→IND, adam→TOR
Round 3: eric→MIA, ben→SAC, mintz→CHI, mcard→CHA, omar→POR, adam→NO, pete→PHX, carter→UTAH, whet→BKN, mzapp→WSH
```

### Files Created/Modified
- `migrations/nba26_data.sql` - Database migration (executed)
- `src/pages/nba26.astro` - Leaderboard page
- `src/pages/api/events/[slug].ts` - Added `team_standings` to API response
- `scripts/sync-nba26.js` - Auto-sync worker
- `wrangler.sync.toml` - Sync worker config with Cron triggers

### Administration
```bash
# Manual sync trigger
curl https://vig-sync.cf-2b5.workers.dev/

# Check current standings via API
curl https://vig-6dw.pages.dev/api/events/nba26 | jq '.standings'

# Direct database query
wrangler d1 execute vig-db --remote --command="SELECT user_name, wins, losses FROM standings JOIN users ON standings.user_id = users.id WHERE event_id = 'nba26-event' ORDER BY wins DESC"
```

### Future Enhancements
1. **Gmail Auth** - OAuth2 integration for user management
2. **Admin Panel** - Create new pools, manage teams
3. **Multiple Pool Types** - Squares pools, brackets
4. **Real-time WebSocket** - Live score updates during games
