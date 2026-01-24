# Plan: The Vig - Complete Enhancement Roadmap

## Goal
Implement all 4 future enhancements to make The Vig a fully-featured prediction pool platform with user authentication, admin controls, multiple pool types, and real-time updates.

## User Requirements (Clarified)
- **Payment Model**: Real money tracking (Venmo/CashApp payments for entry fees, prizes)
- **Pool Creation**: Template-based invite system (friends create pools from existing templates, not arbitrary types)
- **OAuth2**: Google only (Gmail authentication)
- **Dashboard**: Unified view (payments, standings, picks, history)
- **Generic Debt Tracking**: Track debts outside of pools (e.g., "Adam owes me $20")
- **Async Draft Notifications**: Email next person when it's their turn to pick
- **API Constraint**: MUST stay under 1,000 TheRundown requests/month (hard limit)

## Current State (What Already Exists)

### Completed
- [x] Password-based auth with PBKDF2 + JWT (`src/lib/auth.ts`)
- [x] Admin panel at `/admin/index.astro` (267 lines)
- [x] Real-time leaderboards via Durable Objects (`src/lib/leaderboard-do.ts`)
- [x] TheRundown API integration (`src/lib/sports-api.ts`)
- [x] Wins pool type fully implemented
- [x] Database schema supports flexible `prediction_data` for multiple pool types

### Gaps to Fill
- [ ] Google OAuth2 integration
- [ ] Player dashboard (payment tracking, unified view)
- [ ] Generic debt tracking system
- [ ] Async draft email notifications
- [ ] Squares pool UI
- [ ] Template-based pool creation
- [ ] Beads initialization for task tracking

### Removed from Scope
- [ ] Bracket/March Madness pools (too complex, deprioritized)

## TheRundown API Budget (1,000 requests/month)

**Current Usage**:
- NBA26 sync: 1 sync/3 hours = 8 syncs/day × 30 days = 240 syncs/month
- Each sync fetches 7 days of games (future optimization: cache in KV)
- Estimated: ~300-400 requests/month for existing pools

**Remaining Budget**: ~600 requests/month for new features

**Strategy**:
1. **Smart sync windows** - Only sync when games are actually happening
2. **Cache games in KV** - Store game data with TTL, reduce API calls
3. **"Upcoming Games" from cache** - Read from KV, not API
4. **Delta endpoints** - Use TheRundown delta API for changes only

**Smart Sync Windows** (NEW):
```javascript
// Only sync during game hours - who cares about mornings?
const SYNC_WINDOWS = [
  { start: "19:00 ET", end: "23:59 ET" }, // Evening games
  { start: "00:00 ET", end: "02:00 ET" },  // Late night games
];

// During season: sync every 30 min during windows
// Off-season: sync once/day at 7pm to check for new schedules
// Current: 1 sync/3 hours = 8 syncs/day → can reduce to 4 syncs/day
```

**With Smart Windows**:
- Season (with games): ~4 syncs/day × 7 days/week = 28 syncs/week
- Off-season: 1 sync/day = 7 syncs/week
- **Savings**: 50% reduction during season, 87% reduction off-season

**KV Cache Strategy**:
```javascript
// Cache key format: "games:{date}" → TTL 1 hour
// Cache key format: "scores:{gameId}" → TTL 5 min (during games)
await KV.put(`games:${date}`, JSON.stringify(games), { expirationTtl: 3600 });
```

**"Upcoming Games" Implementation** (API-safe):
```javascript
// NO extra API calls - use cached data
async function getUpcomingGames(userId, env) {
  // Get user's selections
  const selections = await getUserSelectionions(userId, env.DB);

  // Get ALL games from KV cache (populated by sync worker)
  const cachedGames = await env.KV.get("games:upcoming", "json");

  // Filter to user's teams
  const myTeams = selections.map(s => s.option_id);
  return cachedGames.filter(g =>
    myTeams.includes(g.home_team_id) || myTeams.includes(g.away_team_id)
  );
}
```


## Beads Initialization (First Step)

```bash
# Initialize beads in the vig repository
cd /home/khamel83/github/vig
bd init

# This will create .beads/ directory and git hooks
```

## Implementation Roadmap

### Phase 1: Google OAuth2 Authentication
**Priority**: P0 (Critical - enables invite-based pools)

**Files to Create**:
- `src/lib/oauth-google.ts` - Google OAuth2 flow handler
- `src/pages/api/auth/google.ts` - OAuth callback endpoint
- `src/pages/api/auth/google-callback.ts` - OAuth redirect handler

**Files to Modify**:
- `src/lib/auth.ts` - Add OAuth user creation, token generation
- `src/pages/login.astro` - Add "Sign in with Google" button
- `wrangler.toml` - Add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` vars

**Database Migration**:
```sql
-- Add OAuth fields to users table
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- Index for Google ID lookup
CREATE INDEX idx_users_google_id ON users(google_id);
```

**Implementation Details**:
1. Google OAuth2 flow uses PKCE (no client secret needed for public clients)
2. On callback: check if `google_id` exists → create user or sign in existing
3. Reuse existing JWT session structure from `src/lib/auth.ts`
4. Store `google_id` and `avatar_url` from Google profile

**Google Cloud Console Setup**:
- Create OAuth 2.0 client ID
- Authorized redirect URI: `https://zoheri.com/api/auth/google-callback`
- Authorized JavaScript origin: `https://zoheri.com`

### Phase 2: Payment Tracking System
**Priority**: P0 (Critical - user requirement)

**Files to Create**:
- `migrations/0002_payments.sql` - Payments table schema
- `src/lib/payments.ts` - Payment CRUD operations
- `src/pages/api/payments.ts` - Payment API endpoints
- `src/pages/api/events/[slug]/payments.ts` - Per-event payment tracking
- `src/pages/api/admin/payment-reminders.ts` - Send payment reminders

**Files to Modify**:
- `src/pages/api/events/[slug].ts` - Include payment status in response
- `src/pages/dashboard.astro` - Show payment status
- `src/pages/admin/index.astro` - Admin payment management view

**Database Schema**:
```sql
CREATE TABLE payments (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    method TEXT,  -- 'venmo', 'cashapp', 'cash', 'other'
    status TEXT DEFAULT 'pending',  -- pending, confirmed, rejected
    transaction_id TEXT,
    notes TEXT,
    dispute_notes TEXT,
    dispute_status TEXT DEFAULT 'none',  -- none, pending, resolved
    confirmed_by TEXT REFERENCES users(id),
    confirmed_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE payment_settings (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    entry_fee_cents INTEGER NOT NULL,
    payment_deadline INTEGER,  -- Unix timestamp
    prize_structure TEXT,  -- JSON: { 1st: 0.5, 2nd: 0.3, 3rd: 0.2 }
    payment_methods TEXT,  -- JSON: ["venmo", "cashapp"]
    payment_instructions TEXT,  -- Venmo/CashApp handle
    UNIQUE(event_id)
);

CREATE INDEX idx_payments_event_user ON payments(event_id, user_id);
CREATE INDEX idx_payments_status ON payments(status);
```

**Payment Flow**:
1. Admin sets entry fee + payment deadline in pool config
2. User sees payment status on dashboard ("Unpaid: $50", "Paid: $50")
3. User submits payment info (Venmo screenshot, transaction ID)
4. Admin confirms/rejects payment
5. **Dispute resolution**: If user contests, add dispute_notes, admin can resolve
6. **Automated reminders**: Cron job sends reminders 3 days, 1 day, and day of deadline
7. Payment status visible on leaderboard

**API Endpoints**:
- `GET /api/events/[slug]/payments` - List all payments (admin only)
- `POST /api/events/[slug]/payments` - Submit payment (user)
- `PATCH /api/payments/[id]` - Confirm/reject payment (admin)
- `POST /api/payments/[id]/dispute` - Open payment dispute (user)
- `PATCH /api/payments/[id]/resolve` - Resolve dispute (admin)
- `GET /api/me/payments` - My payments across all events

**Payment Reminder Email**:
```
Subject: Payment Reminder - [Pool Name]

Hi [Name],

This is a reminder that your entry fee for [Pool Name] is still pending.

Amount: $50
Due: [Date]

Payment methods: Venmo, CashApp
Instructions: [Payment handle]

Click here to pay:
[Link to dashboard]

- The Vig
```

### Phase 3: Player Dashboard
**Priority**: P1 (High - unified view requirement)

**Files to Create**:
- `src/pages/dashboard.astro` - Main player dashboard
- `src/components/DashboardHeader.astro` - User profile, nav
- `src/components/PaymentCard.astro` - Payment status widget
- `src/components/MyPools.astro` - User's pools summary
- `src/components/UpcomingGames.astro` - Games involving user's picks
- `src/components/MyPicks.astro` - All selections across all pools

**Dashboard Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  👤 adam@example.com                    Sign Out           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  💳 Payment Status                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NBA 2026 Pool     ✅ Paid      $50              │   │
│  │  NFL Wins 2025    ⏳ Pending   $50              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  🏆 My Pools                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NBA 2026         1st place    42-15              │   │
│  │  NFL Wins 2025    3rd place    38-20              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  🎯 My Picks (NEW)                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  NBA                                                   │
│  │    • Oklahoma City Thunder (14-6)                   │   │
│  │    • Toronto Raptors (12-8)                         │   │
│  │    • New Orleans Pelicans (16-1)                    │   │
│  │                                                       │   │
│  │  NFL                                                  │   │
│  │    • Chiefs (11-6) • Bills (10-7) • Lions (11-6)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  📅 Upcoming Games (My Teams)                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Today 7:00 PM  Celtics @ Thunder                   │   │
│  │  Tomorrow 8:00 PM  Lakers @ Knicks                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**API Enhancements**:
- `GET /api/me` - Extended to include payment summary, pool count
- `GET /api/me/pools` - User's pools with standings
- `GET /api/me/upcoming` - Upcoming games for user's picks
- `GET /api/me/picks` - All selections across all pools (NEW)

### Phase 4: Template-Based Pool Creation
**Priority**: P1 (High - user requirement)

**Concept**: Friends create pools from templates (not arbitrary types). Admin defines templates, users instantiate them.

**Files to Create**:
- `src/lib/invites.ts` - Invite code generation/management
- `src/pages/api/invites.ts` - Create/use invite codes
- `src/pages/api/pools/create-from-template.ts` - Instantiate from template
- `src/components/CreatePoolWizard.astro` - Step-by-step pool creation
- `src/pages/join.astro` - New page: join pool via invite code
- `src/pages/api/pools/[id]/lifecycle.ts` - Pool state transitions

**Files to Modify**:
- `src/lib/db.ts` - Add invite + template CRUD
- `src/pages/admin/index.astro` - Add template management, invite codes
- `wrangler.toml` - Add Resend API key for email notifications

**Database Schema**:
```sql
-- Pool templates (admin-defined)
CREATE TABLE pool_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sport TEXT,
    pool_type TEXT,
    version INTEGER DEFAULT 1,  -- For versioning
    config TEXT NOT NULL DEFAULT '{}',
    default_entry_fee_cents INTEGER,
    is_public INTEGER DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Events table extended with lifecycle fields
ALTER TABLE events ADD COLUMN predictions_locked_at INTEGER;
ALTER TABLE events ADD COLUMN completed_at INTEGER;
ALTER TABLE events ADD COLUMN archived_at INTEGER;
ALTER TABLE events ADD COLUMN template_version INTEGER;
ALTER TABLE events ADD COLUMN template_id TEXT REFERENCES pool_templates(id);

-- Invite codes
CREATE TABLE invite_codes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    created_by TEXT REFERENCES users(id),
    max_uses INTEGER DEFAULT 1,
    uses INTEGER DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_templates_public ON pool_templates(is_public);
CREATE INDEX idx_invites_code ON invite_codes(code);
CREATE INDEX idx_invites_event ON invite_codes(event_id);
```

**Pool Lifecycle States**:
```
draft → open → locked → completed → archived
  ↓        ↓         ↓          ↓          ↓
create  join   predictions  final    hide
        teams   locked     calc
```

**Pool Creation Flow**:
1. Admin creates template (e.g., "NBA Wins Pool 2026", "Squares Pool")
2. User clicks "Start a Pool", selects template (simplified 3-step wizard)
3. User enters pool name, entry fee, payment deadline
4. Pool created (status = 'draft'), invite code generated, auto-copied
5. User shares invite link immediately: `zoheri.com/join?code=NBA26-KHAMEL`
6. New user clicks link → Google OAuth → auto-joins pool
7. Pool becomes 'open' when creator starts it
8. Admin transitions pool through lifecycle states

**Lifecycle Operations**:
- `PATCH /api/pools/[id]/open` - Open pool for joining
- `PATCH /api/pools/[id]/lock` - Lock predictions (before games start)
- `PATCH /api/pools/[id]/complete` - Mark pool complete, calculate final standings
- `PATCH /api/pools/[id]/archive` - Archive pool (remove from active view)

**Template Versioning**:
- Admin updates template → version increments
- Existing pools lock to template_version they were created with
- New pools use latest template version
- Admin can see which pools use which template version

**Templates Available** (admin-defined, extensible):
- NBA Wins Pool
- NFL Wins Pool
- Super Bowl Squares
- (future: March Madness - admin can add later)

### Phase 5: Generic Debt Tracking
**Priority**: P1 (High - user requirement)

**Concept**: Track debts outside of pools. "Adam owes me $20 for dinner", etc.

**Files to Create**:
- `migrations/0003_debts.sql` - Debts table schema
- `src/lib/debts.ts` - Debt CRUD operations
- `src/pages/api/debts.ts` - Debt API endpoints
- `src/components/DebtsList.astro` - Display debts on dashboard

**Files to Modify**:
- `src/pages/dashboard.astro` - Add debts section

**Database Schema**:
```sql
CREATE TABLE debts (
    id TEXT PRIMARY KEY,
    creditor_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    debtor_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'outstanding',  -- outstanding, paid, cancelled
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    settled_at INTEGER,
    FOREIGN KEY (creditor_id) REFERENCES users(id),
    FOREIGN KEY (debtor_id) REFERENCES users(id)
);

CREATE INDEX idx_debts_creditor ON debts(creditor_id, status);
CREATE INDEX idx_debts_debtor ON debts(debtor_id, status);
```

**Debt Flow**:
1. User creates debt: "Adam owes me $20 - dinner"
2. Adam sees on dashboard: "You owe $20 to [user]"
3. Adam marks as paid → creditor confirms
4. Both users see updated status

**UI on Dashboard**:
```
💸 Debts
┌─────────────────────────────────────────────────────┐
│  You owe:                                           │
│  • $20 to adam (dinner)         [Mark Paid]         │
│                                                     │
│  Owed to you:                                       │
│  • $50 from eric (NBA pool)       [Confirm]         │
└─────────────────────────────────────────────────────┘
```

### Phase 6: Async Draft Notifications
**Priority**: P1 (High - user requirement)

**Concept**: Snake draft happens asynchronously. Email next person when it's their turn.

**Files to Create**:
- `src/lib/draft.ts` - Draft state management
- `src/pages/api/draft/[eventId]/pick.ts` - Submit draft pick
- `src/pages/api/draft/[eventId]/next.ts` - Get/set next picker
- `src/pages/api/draft/[eventId]/skip.ts` - Admin skip picker (NEW)
- `src/pages/api/draft/[eventId]/remind.ts` - Resend draft notification (NEW)
- `src/pages/api/admin/draft-monitor.ts` - Admin draft overview (NEW)
- `src/templates/email/draft-turn.html` - Email template
- `src/templates/email/draft-reminder.html` - Reminder email (NEW)
- `src/components/AdminDraftMonitor.astro` - Admin draft view (NEW)

**Files to Modify**:
- `src/lib/email.ts` - Add draft notification function
- `src/pages/[slug]/draft.astro` - Draft room UI

**Database Schema**:
```sql
-- Draft state (per event)
CREATE TABLE draft_state (
    event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    current_round INTEGER DEFAULT 1,
    current_pick_index INTEGER DEFAULT 0,
    current_picker_id TEXT REFERENCES users(id),
    draft_order TEXT,  -- JSON: [user_id, user_id, ...]
    timeout_hours INTEGER DEFAULT 24,  -- Auto-skip after this many hours
    last_pick_at INTEGER,  -- Track when current pick started
    status TEXT DEFAULT 'pending',  -- pending, active, paused, completed
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Draft picks
CREATE TABLE draft_picks (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    pick_order INTEGER NOT NULL,
    option_id TEXT REFERENCES options(id) ON DELETE CASCADE,
    picked_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(event_id, user_id, round)
);

CREATE INDEX idx_draft_picks_event ON draft_picks(event_id, pick_order);
```

**Draft Flow**:
1. Admin starts draft (sets draft order, triggers first pick)
2. Current picker receives email: "It's your turn! [link to draft room]"
3. Picker visits draft room, selects team, clicks "Confirm Pick"
4. System advances to next picker, sends email
5. **Timeout mechanism**: After 12 hours → reminder email; after 24 hours → auto-skip (configurable)
6. **Admin controls**: Can manually skip, resend notification, pause draft
7. Repeat until all rounds complete
8. Final selections written to `selections` table

**Admin Draft Monitor** (NEW):
```
┌─────────────────────────────────────────────────────┐
│  Draft Monitor: NBA 2026                            │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Status: Round 1 of 3 - Pick 3 of 30               │
│  Current: adam (waiting 2h 15m)                    │
│                                                     │
│  [Resend Email] [Skip Picker] [Pause Draft]         │
│                                                     │
│  Draft Order:                                       │
│  1. whet ✅ 0:15:23                                │
│  2. mzapp ✅ 0:42:10                               │
│  3. adam ⏳ 2:15:23 (OVERDUE)                      │
│  4. omar ⏸️ waiting                                 │
│  5. pete ⏸️ waiting                                 │
│  ...                                               │
│                                                     │
│  Settings:                                          │
│  Timeout: 24 hours [Change]                         │
└─────────────────────────────────────────────────────┘
```

**Email Templates**:
```
Subject: It's your turn to pick! - [Pool Name]

Hi [Name],

It's your turn to pick in the [Pool Name] draft.

Round: [Current Round] / [Total Rounds]
Your pick: #[Pick Number]

Click here to make your pick:
[Link to draft room]

You have 24 hours to make your pick before it's auto-skipped.

- The Vig

---

Subject: Reminder: Your turn to pick! - [Pool Name]

Hi [Name],

This is a reminder that you have 12 hours left to make your pick.

Round: [Current Round] / [Total Rounds]
Your pick: #[Pick Number]

[Link to draft room]

- The Vig
```

**Draft Room UI** (mobile-responsive):
```
┌─────────────────────────────────────────────────────┐
│  NBA 2026 Draft - Round 1 of 3              [Menu]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Current Pick: #3 - adam                           │
│  ⏳ Your turn! Pick a team below.                  │
│  Time remaining: 21h 45m                           │
│                                                     │
│  Draft Order: ▼                                     │
│  1. whet - Cleveland Cavaliers ✅                   │
│  2. mzapp - New York Knicks ✅                     │
│  3. adam - ⏳ PICKING NOW                          │
│  4. omar - ⏸️ waiting                              │
│  ...                                               │
│                                                     │
│  Available Teams (scroll):                          │
│  ┌─────────────────────────────────────────────┐   │
│  │ Oklahoma City Thunder          [Select]     │   │
│  │ Denver Nuggets                 [Select]     │   │
│  │ ...                                   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Phase 7: Squares Pool Type
**Priority**: P2 (Medium - additional pool type)

**Files to Create**:
- `src/components/SquaresGrid.astro` - 10x10 interactive grid (mobile-responsive)
- `src/components/SquaresMobile.astro` - Mobile-optimized view
- `src/lib/pools/squares.ts` - Squares pool logic
- `src/pages/api/events/[slug]/squares.ts` - Squares-specific endpoints

**Database Schema Extension**:
```sql
-- Squares prediction_data format:
-- { square: { row: 3, col: 7 } }
-- No new tables needed - uses existing prediction_data JSON
```

**Squares Pool Logic**:
1. Grid: 10 rows x 10 columns = 100 squares
2. Random number assignment (0-9) to rows/cols after Super Bowl
3. Winners: Last digit of each quarter's score
4. Payouts: Q1: 10%, Q2: 20%, Q3: 10%, Final: 60%

**Frontend (Desktop)**:
- Show grid with team names on axes
- Random numbers revealed after selection deadline
- Highlight winning squares each quarter

**Frontend (Mobile)** - NEW considerations:
- Horizontal scroll for 10x10 grid
- Tap-to-select with zoom/modal for precision
- Landscape mode recommendation
- Simplified view: "My Squares" section showing user's selections
- Quick-jump to user's squares on full grid

**Mobile Squares UI**:
```
┌─────────────────────────────────────────────────────┐
│  Super Bowl Squares                        [My #s]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  My Squares (3 selected):                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ Row 3, Col 7  →  Chiefs @ 49ers           │   │
│  │ Row 7, Col 2  →  Chiefs @ 49ers           │   │
│  │ Row 1, Col 9  →  Chiefs @ 49ers           │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [View Full Grid]                                   │
│                                                     │
│  💡 Tip: Use landscape mode for best experience     │
└─────────────────────────────────────────────────────┘
```

### Phase 8: Enhanced Real-time Updates
**Priority**: P3 (Low - already exists, just verify/enhance)

**Files to Verify/Enhance**:
- `src/lib/leaderboard-do.ts` - Durable Object (already exists)
- `src/pages/api/ws/leaderboard.ts` - WebSocket endpoint (already exists)

**Enhancements**:
- Add score updates during games (TheRundown WebSocket)
- Push payment status changes in real-time
- Broadcast new user joins to pool

**WebSocket Message Types**:
```typescript
type WSMessage =
  | { type: 'subscribe', eventId: string }
  | { type: 'update', standings: Standings[] }
  | { type: 'score_update', game: Game }
  | { type: 'payment_update', payment: Payment }
  | { type: 'user_joined', user: User }
```

## Implementation Order (Dependencies)

```
Phase 1: OAuth2 ────────┐
                        ├──→ Phase 3: Dashboard ────┐
Phase 2: Payments ──────┘                          ├──→ Phase 4: Templates
Phase 6: Draft/Email ──────────────────────────────┘       │
Phase 5: Debts ─────────────────────────────────────────────┤
Phase 8: Real-time (verify) ────────────────────────────────┘
                         │
                    Phase 7: Squares
```

**Critical Path**: OAuth2 → Payments → Dashboard → Templates/Invites → Draft/Email

**Parallel Work**: Debts, Squares (independent of critical path)

## Beads Task Structure

Create beads for tracking:

```bash
# After `bd init`, create epics and tasks
bd create --title="Google OAuth2 Integration" --type=epic --priority=0
bd create --title="Payment Tracking System" --type=epic --priority=0
bd create --title="Player Dashboard" --type=epic --priority=1
bd create --title="Template-Based Pool Creation" --type=epic --priority=1
bd create --title="Generic Debt Tracking" --type=epic --priority=1
bd create --title="Async Draft Notifications" --type=epic --priority=1
bd create --title="Squares Pool Type" --type=epic --priority=2

# Add dependencies
bd dep add epic-payments epic-oauth  # Payments depend on OAuth
bd dep add epic-dashboard epic-oauth
bd dep add epic-dashboard epic-payments
bd dep add epic-templates epic-dashboard  # Templates need dashboard
bd dep add epic-draft epic-templates  # Draft needs templates
```

## File Summary

### New Files to Create
| File | Purpose |
|------|---------|
| `migrations/0002_payments.sql` | Payment + invite schema |
| `migrations/0003_debts.sql` | Debt tracking schema |
| `src/lib/oauth-google.ts` | Google OAuth flow |
| `src/lib/payments.ts` | Payment operations |
| `src/lib/invites.ts` | Invite code + template management |
| `src/lib/debts.ts` | Debt CRUD operations |
| `src/lib/draft.ts` | Draft state management |
| `src/lib/pools/squares.ts` | Squares logic |
| `src/pages/api/auth/google.ts` | OAuth endpoint |
| `src/pages/api/auth/google-callback.ts` | OAuth callback |
| `src/pages/api/payments.ts` | Payment CRUD |
| `src/pages/api/invites.ts` | Invite CRUD |
| `src/pages/api/debts.ts` | Debt CRUD |
| `src/pages/api/admin/payment-reminders.ts` | Payment reminders |
| `src/pages/api/pools/create-from-template.ts` | Template instantiation |
| `src/pages/api/pools/[id]/lifecycle.ts` | Pool state transitions |
| `src/pages/api/draft/[eventId]/pick.ts` | Submit draft pick |
| `src/pages/api/draft/[eventId]/next.ts` | Get/set next picker |
| `src/pages/api/draft/[eventId]/skip.ts` | Admin skip picker |
| `src/pages/api/draft/[eventId]/remind.ts` | Resend draft notification |
| `src/pages/api/admin/draft-monitor.ts` | Admin draft overview |
| `src/pages/dashboard.astro` | Player dashboard |
| `src/pages/join.astro` | Join pool via invite |
| `src/pages/[slug]/draft.astro` | Draft room UI |
| `src/templates/email/draft-turn.html` | Draft notification email |
| `src/templates/email/draft-reminder.html` | Reminder email |
| `src/components/DashboardHeader.astro` | Dashboard nav |
| `src/components/PaymentCard.astro` | Payment widget |
| `src/components/MyPools.astro` | Pool summary |
| `src/components/UpcomingGames.astro` | Games widget (cached) |
| `src/components/MyPicks.astro` | All selections summary |
| `src/components/DebtsList.astro` | Debts display |
| `src/components/SquaresGrid.astro` | Squares grid (desktop) |
| `src/components/SquaresMobile.astro` | Squares view (mobile) |
| `src/components/CreatePoolWizard.astro` | Pool creation flow |
| `src/components/AdminDraftMonitor.astro` | Admin draft view |

### Files to Modify
| File | Changes |
|------|---------|
| `src/lib/auth.ts` | Add OAuth support |
| `src/lib/email.ts` | Add draft/payment notification (Resend) |
| `src/pages/login.astro` | Add Google button |
| `src/pages/api/events/[slug].ts` | Add payment status |
| `src/pages/admin/index.astro` | Templates, payments, invites, disputes UI |
| `scripts/sync-nba26.js` | Add smart sync windows |
| `wrangler.toml` | Add OAuth + Resend secrets |
| `PLAN.md` | Document new features |
| `CLAUDE.md` | Update project status |

## Environment Variables (Add to Cloudflare)

```bash
# Google OAuth
GOOGLE_OAUTH_CLIENT_ID=<from Google Cloud Console>
GOOGLE_OAUTH_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_OAUTH_REDIRECT_URI=https://zoheri.com/api/auth/google-callback

# Email (Resend)
RESEND_API_KEY=<from Resend dashboard>

# Payment (optional - for admin Venmo handle display)
ADMIN_VENMO_HANDLE=
ADMIN_CASHAPP_HANDLE=
```

## Verification Strategy

### Per Phase
1. **OAuth2**: Sign in with Google, verify user created, JWT issued
2. **Payments**: Submit payment, open dispute, admin confirms/resolves, automated reminders work
3. **Dashboard**: View all pools, payment status, upcoming games (from cache), my picks
4. **Templates**: Admin creates template, user instantiates pool, versioning works
5. **Debts**: Create debt, mark as paid, confirm by creditor
6. **Draft**: Async draft flow, timeout/skip mechanism, admin monitor, email notifications
7. **Squares**: Create pool, select squares (mobile + desktop), numbers revealed
8. **Lifecycle**: Pool state transitions (draft→open→locked→completed→archived)

### End-to-End Test
1. Admin creates "NBA Wins Pool" template
2. User instantiates pool from template (3-step wizard), invite code auto-copied
3. User shares invite link, friends join via Google OAuth
4. Users see $50 entry fee + payment deadline on dashboard
5. Automated payment reminders sent at 3 days, 1 day, day of deadline
6. User submits Venmo payment, admin confirms
7. Admin opens pool, starts async draft
8. First picker gets email, picks via draft room
9. Picker 2 doesn't respond → reminder at 12h, auto-skip at 24h
10. Admin monitors via Draft Monitor dashboard
11. Draft completes, selections written to database
12. Pool locks before games start
13. Real-time score updates during games (from cached data)
14. Pool completes, final standings calculated, pool archived
15. User tracks side debts on dashboard

## Git Workflow with Beads

```bash
# After beads initialization
bd ready                    # Show available work
bd update <id> --status=in_progress  # Claim task
# ... do work ...
git add -A
git commit -m "feat: implement OAuth2 flow"
bd close <id>              # Mark complete
bd sync                    # Push to git
git push                   # Push to remote
```

## Estimated Effort

| Phase | Files | Complexity | Est. Issues |
|-------|-------|------------|-------------|
| OAuth2 | 5 | Medium | 8-10 |
| Payments | 9 | Medium | 12-15 |
| Dashboard | 8 | Medium | 10-12 |
| Templates/Invites | 8 | Medium | 10-12 |
| Debts | 4 | Low-Medium | 5-7 |
| Draft/Email | 11 | Medium-High | 12-15 |
| Squares | 5 | Medium | 7-9 |
| Real-time verify | 3 | Low | 3-4 |

**Total**: ~65-85 beads tasks across all phases

## Sub-Agent Review (COMPLETED)

A sub-agent has reviewed this plan from both admin and user perspectives. The following gaps were identified and addressed:

### Issues Addressed

**Critical (Added)**:
1. ✅ Draft timeout/skip mechanism (12h reminder, 24h auto-skip)
2. ✅ Admin draft monitor dashboard
3. ✅ Payment dispute resolution workflow
4. ✅ Payment deadline + automated reminders
5. ✅ Pool lifecycle states (draft→open→locked→completed→archived)
6. ✅ Template versioning strategy

**Important (Added)**:
1. ✅ "My Picks" summary on dashboard
2. ✅ Mobile-responsive squares grid
3. ✅ Mobile-friendly draft room
4. ✅ Draft reminder emails

**Nice to Have (Deferred)**:
- Email delivery log monitoring (deferred - can add later)
- Admin analytics/reporting dashboard (deferred - nice-to-have)

### Final Assessment

**Ready to proceed** - All critical gaps identified by the sub-agent have been addressed in the updated plan.

---

**Next Steps**:
1. Copy final plan to `/home/khamel83/github/vig/IMPLEMENTATION_PLAN.md`
2. Clear context
3. Execute plan deterministically using beads for tracking
4. Follow implementation order: OAuth2 → Payments → Dashboard → Templates → Debts → Draft → Squares
