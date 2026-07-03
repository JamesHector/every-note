# Phase 0: Foundation — Database & Auth Migration

**Goal:** Migrate from MVP (localStorage names) to a solid foundation that supports both friends-sharing now and public expansion later, plus monetization APIs.

**Timeline:** 2-3 weeks

---

## Current State

### What's Working
- ✅ Gig discovery (2 sources: Bristol Jazz Live, St George's Bristol)
- ✅ Filters (venue, date, search)
- ✅ Status progression (Interested → Booked → Going)
- ✅ Friend coordination (who's going where)
- ✅ Deployed on Render

### What's Missing for Monetization
- ❌ Real user accounts (just localStorage names)
- ❌ User authentication
- ❌ Proper user/venues database relationships
- ❌ Friend invite system
- ❌ User profiles (for public expansion)
- ❌ Analytics tracking (for revenue reporting)

---

## Phase 0a: Database Schema Migration (Week 1)

### New Schema (OpenClaw recommendation + modifications)

```sql
-- VENUES table (for venue API monetization later)
CREATE TABLE venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT DEFAULT 'Bristol',
  website TEXT,
  is_verified BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- USERS table (real accounts, not localStorage)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  is_public BOOLEAN DEFAULT 0,  -- false = friends-only, true = public profile
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FRIENDS table (friend relationships)
CREATE TABLE friends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending, accepted, blocked
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(friend_user_id) REFERENCES users(id),
  UNIQUE(user_id, friend_user_id)
);

-- GIGS table (updated with proper fields)
CREATE TABLE gigs (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL,
  artist_name TEXT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,  -- ISO format: "2026-07-15T19:30:00Z"
  time TEXT,           -- extracted time: "19:30"
  genres TEXT,         -- JSON array: ["Jazz", "Blues"]
  ticket_url TEXT,
  ticket_price DECIMAL(10, 2),
  description TEXT,
  source TEXT NOT NULL,  -- "bristol-jazz-live", "st-george's", etc
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(venue_id) REFERENCES venues(id)
);

-- GIG_INTERESTS table (replaces old "interested" table)
CREATE TABLE gig_interests (
  id TEXT PRIMARY KEY,
  gig_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'interested',  -- interested, booked, going
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gig_id, user_id),
  FOREIGN KEY(gig_id) REFERENCES gigs(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- INVITE_LINKS table (for friend invites)
CREATE TABLE invite_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  used_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### Changes Needed in server.js
1. Update database initialization to create new tables
2. Create migration script to:
   - Copy existing venues (distinct) to venues table
   - Import existing gigs, mapping venues
   - No user data to migrate (starting fresh)
3. Add UUID generation for TEXT IDs
4. Update all API routes to use new schema

---

## Phase 0b: User Authentication & Accounts (Week 2)

### New Routes

**Auth:**
- `POST /api/auth/register` — create account (email, password, username)
- `POST /api/auth/login` — return JWT token
- `POST /api/auth/logout` — invalidate token
- `GET /api/auth/me` — get current user (requires JWT)

**User Profile:**
- `GET /api/users/:userId` — public profile info
- `PUT /api/users/me` — update own profile (avatar, is_public)
- `POST /api/users/me/avatar` — upload avatar (Gravatar fallback)

**Friends:**
- `POST /api/friends/invite` — generate invite link
- `POST /api/friends/accept/:token` — accept invite
- `GET /api/friends` — list user's friends
- `GET /api/friends/pending` — pending requests
- `DELETE /api/friends/:friendId` — remove friend

### Frontend Changes
1. Replace name modal with login/register flow
2. Add "Invite friends" button (generates shareable link)
3. Show friend list in UI
4. Add user profile page

### Authentication
- Use JWT tokens (stored in localStorage)
- Password hashing: bcrypt
- Tokens expire in 7 days

---

## Phase 0c: Update Gig Scrapers (Week 2)

### Update parseBristolJazz()
- Extract artist names from gig titles (or description)
- Parse genres (not just category)
- Store time separately from date

### Update parseStGeorges()
- Extract artist names
- Parse category as JSON array (may have multiple genres)
- Add ticket price if available

### New Structure
All gigs now have:
```json
{
  "id": "uuid",
  "venue_id": "venue-uuid",
  "artist_name": "The Beatles",
  "title": "The Beatles at St George's",
  "date": "2026-07-15T19:30:00Z",
  "time": "19:30",
  "genres": ["Rock", "Pop"],
  "ticket_url": "...",
  "ticket_price": 45.00,
  "source": "st-george's"
}
```

---

## Testing Checklist

- [ ] New schema created in SQLite
- [ ] Migration runs without errors
- [ ] All gigs imported with venue relationships
- [ ] Register new user → stored correctly with hash
- [ ] Login → returns JWT token
- [ ] JWT validates on protected routes
- [ ] Invite link generated → shareable
- [ ] Friend accepts invite → relationship created
- [ ] Gig interests saved with user_id (not user_name)
- [ ] Attendance grid shows friends (from friends table)
- [ ] Existing gig discovery still works

---

## Deployment Considerations

- **Database backup** before migration (download gigs.db)
- **Render env vars:** add JWT_SECRET
- **First deploy:** migration script runs automatically
- **Rollback plan:** keep old gigs.db, can restore if needed

---

## Success Criteria

✅ Friends can create accounts and invite each other
✅ Friend group can coordinate gigs (who's going where)
✅ Architecture supports public expansion later
✅ Ready for Phase 1: more gig sources
✅ APIs structured for monetization

---

## Notes

- User photos: Start with Gravatar (free, no storage). Add file upload if needed.
- Privacy: All users default to private (friends-only). Can toggle public later.
- Monetization ready: Can now sell APIs per user/venue tier
