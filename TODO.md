# TODO - The Vig

Project task tracking following [todo.md](https://github.com/todomd/todo.md) spec.

**Repo**: https://github.com/Khamel83/vig

## Implementation Progress

### Done ✓
- [x] **Phase 1.1: Project Setup** - Astro + Cloudflare + Tailwind initialized
- [x] **Phase 1.2: D1 Database** - Schema created with all tables and indexes
- [x] **Phase 1.3: Auth System** - Password hashing (PBKDF2), JWT, sessions
- [x] **Phase 2.1: Event CRUD** - Admin dashboard, event creation/management
- [x] **Phase 2.2: Selection Flow** - User picks teams, event pages, leaderboard
- [x] **Phase 3.1: Real-time Leaderboards** - Durable Objects WebSocket
- [x] **Phase 3.2: Sports API Integration** - TheRundown API with verified team IDs

### Ready for Deploy
- [ ] **Phase 4: Deployment** - Create D1 database, KV namespace, deploy to Pages

### Backlog
- [ ] Add NBA teams seed data
- [ ] Email notifications via Resend
- [ ] Mobile responsive polish
- [ ] Squares pool type

## Quick Reference

### Deployment Checklist
```bash
# 1. Create Cloudflare resources
wrangler d1 create vig-db
wrangler kv namespace create VIG_KV

# 2. Update wrangler.toml with IDs

# 3. Run migrations
wrangler d1 execute vig-db --file=migrations/0001_initial.sql

# 4. Set secrets in Cloudflare dashboard
# - JWT_SECRET
# - THE_RUNDOWN_API_KEY (RapidAPI)
# - RESEND_API_KEY

# 5. Deploy
npm run deploy
```

### Dev Commands
```bash
npm run dev               # Local development
npm run build             # Build for Cloudflare
npm run deploy            # Deploy to Cloudflare Pages
npm run db:migrate        # Run D1 migrations
```

### Stack
- **Frontend**: Astro + React Islands + Tailwind
- **Backend**: Cloudflare Workers (via Pages Functions)
- **Database**: Cloudflare D1 (SQLite at edge)
- **Auth**: JWT + Password (PBKDF2)
- **Real-time**: Durable Objects WebSocket
- **Sports Data**: TheRundown API (RapidAPI)

### Key Files
- `src/lib/db.ts` - Database queries
- `src/lib/auth.ts` - Authentication
- `src/lib/scoring.ts` - Standings calculation
- `src/lib/leaderboard-do.ts` - Durable Object for WebSocket
- `src/lib/sports-api.ts` - TheRundown integration
- `migrations/0001_initial.sql` - D1 schema

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Sign in |
| `/api/auth/me` | GET | Get current user |
| `/api/events` | GET/POST | List/create events |
| `/api/events/[slug]` | GET/PATCH/DELETE | Event details |
| `/api/events/[slug]/selections` | GET/POST/DELETE | User picks |
| `/api/admin/seed-teams` | POST | Seed NFL teams |
| `/api/admin/sync-scores` | POST | Sync live scores |
| `/api/admin/scoring` | POST | Recalculate standings |
| `/api/ws/leaderboard` | WS | Real-time updates |

---
*Updated: 2026-01-24 - Core implementation complete, ready for deploy*
