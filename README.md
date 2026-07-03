# Every Note — Bristol Gig Discovery

A shared gig discovery platform for friends in Bristol. Discover upcoming gigs, coordinate who's going, and plan nights out together.

**Vision:** Start as a private friends-sharing tool → evolve into a public platform → monetize via APIs for artists, venues, and fans.

**Live:** https://every-note.onrender.com/

---

## Current Status

### Phase 1 MVP ✅ (Complete)
- Browse gigs from Bristol Jazz Live & St George's Bristol
- Filter by venue, date range, genre, search term
- Mark gigs as interested/booked/going
- See who else is going to each gig
- Responsive mobile + desktop
- Auto-refresh every 6 hours

### Phase 0 (Foundation) 🔄 (In Progress)
Migrating from MVP to production-ready:
- User accounts + authentication (email/password)
- Friend invite system
- Updated database schema (proper relationships, TEXT IDs)
- User profiles + avatars
- Analytics tracking (for future revenue)

**See:** [PHASE_0_FOUNDATION_PLAN.md](PHASE_0_FOUNDATION_PLAN.md)

---

## Future Roadmap

### Phase 2: More Gig Sources
- Bristol Beacon, Thekla, Fleece, SWX
- jazzata.com, Bandsintown, Songkick
- Ticket price tracking

### Phase 3: Follow Artists
- Follow favorite bands
- Email alerts when they tour Bristol
- Tour planning (where could they play next?)

### Phase 4: Manual Submissions
- Users add gigs not yet scraped
- Moderation workflow

### Phase 5: Calendar View
- Month view with gigs on dates
- Better planning UI

### Phase 6: Email Newsletters
- Weekly digest for your friends' group
- Personalized by interests

### Phase 7: APIs & Monetization
- **Unified gig API** — $X/month for platforms
- **Venue dashboard** — manage listings, analytics
- **Affiliate revenue** — commission on ticket sales
- **Featured listings** — venues pay to promote

---

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite
- **Frontend:** Vanilla HTML/CSS/JavaScript
- **Hosting:** Render (auto-deploy from GitHub)
- **Auth:** JWT tokens + bcrypt

---

## Local Development

### Requirements
- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/JamesHector/every-note.git
cd every-note
npm install
npm start
```

Runs on `http://localhost:3001`

### Database

- Auto-created on first run as `gigs.db`
- Migrations run automatically

---

## Deployment

```bash
git push origin main
```

Render auto-deploys on push. See Render dashboard at https://dashboard.render.com/

---

## Architecture Notes

- **IDs:** TEXT (UUID) for scalability
- **Venues:** Separate table (for venue API monetization)
- **Users:** Real accounts, not localStorage
- **Privacy:** Friends-only by default, public mode optional
- **Scraping:** HTML parsers for Bristol Jazz Live & St George's; extensible for more sources

---

## Key Files

- `server.js` — Express backend, database, scrapers, API routes
- `public/app.js` — Frontend logic, filters, UI
- `public/index.html` — Page structure
- `public/style.css` — Responsive styling
- `PHASE_0_FOUNDATION_PLAN.md` — Current migration plan
