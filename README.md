# Every Note — Bristol Gig Discovery

A shared gig discovery platform for Bristol music fans. Browse upcoming gigs, filter by venue, search by artist, and mark events as interested.

## Features (Phase 1 MVP)

- Browse upcoming gigs from Bristol Jazz Live and St George's Bristol
- Filter by venue
- Filter by date range
- Search by band name, venue, or category
- Responsive design for mobile and desktop
- Auto-refreshes gig data every 6 hours

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite
- **Frontend:** Vanilla HTML/CSS/JavaScript
- **Hosting:** Render

## Local Development

### Requirements
- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/yourusername/every-note.git
cd every-note
npm install
npm start
```

Server runs on `http://localhost:3001`

## Deployment to Render

1. Push code to GitHub (https://github.com/jamesbhector42/every-note)
2. Create new Web Service on Render
3. Connect GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Deploy!

The database (`gigs.db`) will be created on first run.

## Future Phases

- **Phase 2:** "I'm interested" functionality
- **Phase 3:** Follow favorite bands
- **Phase 4:** Manual gig submissions
- **Phase 5:** More venue sources (Bristol Beacon, Thekla, Skiddle, etc)
- **Phase 6:** Email newsletters
- **Phase 7:** Revenue (affiliate links, featured listings)
