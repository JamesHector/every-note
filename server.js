const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const https = require('https');
const bodyParser = require('body-parser');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3001;

// Decode HTML entities
function decodeHtmlEntities(text) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&ndash;': '–'
  };
  return text.replace(/&[a-zA-Z#]+;/g, match => entities[match] || match);
}

app.use(bodyParser.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./gigs.db', (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

// Initialize database schema
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS gigs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    date TEXT,
    venue TEXT,
    url TEXT,
    source TEXT,
    category TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS interested (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gig_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(gig_id, user_name)
  )`);
});

// ============ GIG SCRAPERS (from Speaker Web) ============

function httpsGet(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'EveryNote/1.0' }, family: 4 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpsFetch(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EveryNote/1.0)' },
      family: 4
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsFetch(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function normalizeVenue(venue) {
  // Remove URLs and cruft
  venue = venue.replace(/https?:\/\/[^\s]+/g, '').trim();
  venue = venue.replace(/-\s*$/, '').trim();  // Remove trailing dash

  // Normalize St George's variations
  if (venue.toLowerCase().includes('st george')) {
    return 'St George\'s Bristol';
  }

  // Normalize venue names to handle variations
  if (venue.includes('Bristol Beacon') || venue.includes('Lantern Hall')) {
    return 'Bristol Beacon';
  }

  // Simplify multi-venue festivals
  if (venue.toLowerCase().includes('various venues')) {
    return venue.split(/[-–]/)[0].trim();  // Take first part before dash
  }

  // Limit to reasonable length
  if (venue.length > 60) {
    return venue.substring(0, 57) + '...';
  }

  return venue;
}

function parseBristolJazz(html) {
  const startIdx = html.indexOf('events: [');
  if (startIdx === -1) return [];
  const arrayStart = startIdx + 'events: '.length;
  let depth = 0, i = arrayStart;
  while (i < html.length) {
    const c = html[i];
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { if (--depth === 0) break; }
    i++;
  }
  try {
    const events = JSON.parse(html.slice(arrayStart, i + 1));
    const now = new Date();
    return events
      .filter(e => new Date(e.start) >= now)
      .map(e => {
        const desc = e.description || '';
        const venuePart = desc.split(/<br\s*\/?>|\n/i)[0];
        let venue = venuePart.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
        // Only apply normalization if venue was extracted, don't use Bristol Jazz Live as fallback
        venue = normalizeVenue(venue) || 'Check venue';
        const hrefMatch = desc.match(/href="([^"]+)"/);
        const plainUrl = desc.match(/https?:\/\/[^\s<"]+/);
        const url = hrefMatch ? hrefMatch[1] : (plainUrl ? plainUrl[0] : '');

        // Extract and clean description for display
        let cleanDesc = '';
        if (e.description) {
          cleanDesc = e.description
            .replace(/<[^>]+>/g, '')  // Remove HTML tags
            .replace(/https?:\/\/[^\s]+/g, '')  // Remove URLs
            .replace(/\s+/g, ' ')  // Normalize whitespace
            .trim()
            .substring(0, 200);  // Limit length
        }

        return {
          title: e.title,
          date: e.start,
          venue,
          url,
          source: 'Bristol Jazz Live',
          category: 'Jazz',
          description: cleanDesc
        };
      });
  } catch { return []; }
}

function parseStGeorges(html) {
  const now = new Date();
  const events = [];
  const cards = html.split('c-col-card--event');
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    const titleMatch = card.match(/c-col-card__title[^>]*>([^<]+)<\/h4>/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    const timeMatch = card.match(/<time[^>]*>([^<]+)<\/time>/);
    const dateRaw = timeMatch
      ? timeMatch[1].replace(/&ndash;[\s\S]*$/, '').replace(/&[a-zA-Z]+;/g, ' ').trim()
      : '';
    const date = dateRaw ? new Date(dateRaw) : null;
    if (date && !isNaN(date.getTime()) && date < now) continue;
    const catMatch = card.match(/c-col-card__taxonomy[\s\S]*?<span>([^<]+)<\/span>/);
    const category = catMatch ? decodeHtmlEntities(catMatch[1].trim()) : '';
    const hrefMatch = card.match(/href="([^"]+)"/);
    const bookMatch = card.match(/href="([^"]*\/book[^"]*)"/);
    const url = bookMatch ? bookMatch[1] : (hrefMatch ? hrefMatch[1] : '');

    // Try to extract description from the card
    const descMatch = card.match(/c-col-card__desc[^>]*>([^<]+)<\/div/i);
    const description = descMatch ? descMatch[1].trim().substring(0, 300) : '';

    events.push({
      title,
      date: date ? date.toISOString() : dateRaw,
      venue: 'St George\'s Bristol',
      url,
      source: 'St George\'s Bristol',
      category,
      description
    });
  }
  return events;
}

async function fetchAllGigs() {
  try {
    const [jazz, george] = await Promise.allSettled([
      httpsFetch('https://bristoljazzlive.co.uk/'),
      httpsFetch('https://www.stgeorgesbristol.co.uk/whats-on/')
    ]);

    const gigs = [];
    if (jazz.status === 'fulfilled') gigs.push(...parseBristolJazz(jazz.value || ''));
    if (george.status === 'fulfilled') gigs.push(...parseStGeorges(george.value || ''));

    // Add Bar Lotte gigs (placeholder for now - PDF parsing coming soon)
    const barLotte = await parseBarLottePDF();
    gigs.push(...barLotte);

    return gigs;
  } catch (e) {
    console.error('Error fetching gigs:', e.message);
    return [];
  }
}

async function parseBarLottePDF() {
  try {
    console.log('Bar Lotte gig fetching: PDF parsing not yet implemented - manual submission coming soon');
    return [];
  } catch (e) {
    console.error('Error parsing Bar Lotte PDF:', e.message);
    return [];
  }
}

// ============ DATABASE OPERATIONS ============

function insertGigs(gigs) {
  return new Promise((resolve, reject) => {
    // Clear old gigs first
    db.run('DELETE FROM gigs', (err) => {
      if (err) return reject(err);

      const stmt = db.prepare('INSERT INTO gigs (title, date, venue, url, source, category, description) VALUES (?, ?, ?, ?, ?, ?, ?)');

      gigs.forEach(g => {
        stmt.run([g.title, g.date, g.venue, g.url, g.source, g.category, g.description || ''], (err) => {
          if (err) console.error('Insert error:', err);
        });
      });

      stmt.finalize((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

function getGigs(filters = {}) {
  return new Promise((resolve, reject) => {
    // Start with all gigs
    let query = 'SELECT * FROM gigs WHERE 1=1';
    const params = [];

    // If venue is selected, ignore date filters but still apply genre filters
    const venueSelected = filters.venues && filters.venues.length > 0;

    // Date filter (skip if venue selected)
    if (!venueSelected && filters.startDate) {
      query += ' AND date >= ?';
      params.push(filters.startDate);
    }
    if (!venueSelected && filters.endDate) {
      query += ' AND date <= ?';
      params.push(filters.endDate);
    }

    // Genre/Category filter (apply regardless of venue selection)
    if (filters.genres && filters.genres.length > 0) {
      const placeholders = filters.genres.map(() => '?').join(',');
      query += ` AND category IN (${placeholders})`;
      params.push(...filters.genres);
    }

    // Search filter
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query += ' AND (title LIKE ? OR venue LIKE ? OR category LIKE ?)';
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY date ASC';

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);

      // Get all gigs, filter out placeholder/unwanted entries, and apply venue filter in JavaScript
      let results = (rows || []).filter(r => {
        if (!r.venue) return false;
        const venueLower = r.venue.toLowerCase();
        const titleLower = r.title.toLowerCase();

        // Filter out unwanted entries
        if (venueLower.includes('check venue')) return false;
        if (venueLower.includes('celebrating nat king cole')) return false;
        if (venueLower.includes('various venues')) return false;  // Filter out festival entries
        if (titleLower.includes('celebrating nat king cole')) return false;

        return true;
      });

      // Venue filter - match after normalizing both sides
      if (filters.venues && filters.venues.length > 0) {
        results = results.filter(gig => {
          const normalizedGigVenue = normalizeVenue(gig.venue);
          return filters.venues.some(selectedVenue => {
            const normalizedSelected = normalizeVenue(selectedVenue);
            return normalizedGigVenue === normalizedSelected;
          });
        });
      }

      // Normalize venue names in results
      const normalized = results.map(r => ({...r, venue: normalizeVenue(r.venue)}));
      resolve(normalized);
    });
  });
}

function getVenues() {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT venue FROM gigs ORDER BY venue', (err, rows) => {
      if (err) return reject(err);
      // Filter out unwanted venues and normalize
      const venues = (rows || [])
        .filter(r => {
          const venueLower = r.venue.toLowerCase();
          if (venueLower.includes('check')) return false;
          if (venueLower.includes('celebrating')) return false;
          if (venueLower.includes('various') || venueLower.includes('festival')) return false;
          return true;
        })
        .map(r => normalizeVenue(r.venue));
      // Remove duplicates
      resolve([...new Set(venues)].sort());
    });
  });
}

function getGenres() {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT category FROM gigs WHERE category != "" ORDER BY category', (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []).map(r => r.category).filter(c => c));
    });
  });
}

function addInterest(gigId, userName) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO interested (gig_id, user_name) VALUES (?, ?)',
      [gigId, userName],
      function(err) {
        if (err) return reject(err);
        resolve({ success: true });
      }
    );
  });
}

function getInterested(gigId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT user_name FROM interested WHERE gig_id = ? ORDER BY created_at ASC',
      [gigId],
      (err, rows) => {
        if (err) return reject(err);
        const names = (rows || []).map(r => r.user_name);
        resolve(names);
      }
    );
  });
}

// ============ ROUTES ============

app.get('/api/gigs', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      venues: req.query.venues ? req.query.venues.split(',') : [],
      genres: req.query.genres ? req.query.genres.split(',') : [],
      search: req.query.search
    };

    const gigs = await getGigs(filters);
    res.json(gigs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/venues', async (req, res) => {
  try {
    const venues = await getVenues();
    res.json(venues);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/genres', async (req, res) => {
  try {
    const genres = await getGenres();
    res.json(genres);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/interested', async (req, res) => {
  try {
    const { gigId, userName } = req.body;

    if (!gigId || !userName) {
      return res.status(400).json({ error: 'gigId and userName required' });
    }

    if (userName.trim().length === 0) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    // Limit name length to prevent abuse
    if (userName.length > 100) {
      return res.status(400).json({ error: 'Name too long (max 100 chars)' });
    }

    const result = await addInterest(gigId, userName.trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/interested/:gigId', async (req, res) => {
  try {
    const gigId = req.params.gigId;
    const names = await getInterested(gigId);
    res.json({ gigId: parseInt(gigId), interested: names });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/attendance-summary', async (req, res) => {
  try {
    // Get all gigs with interested users
    const gigs = await new Promise((resolve, reject) => {
      db.all('SELECT id, title, date, venue FROM gigs ORDER BY date ASC', async (err, rows) => {
        if (err) return reject(err);

        // Get interested users for each gig
        const gigsWithInterested = await Promise.all(
          (rows || []).map(async gig => {
            const interested = await getInterested(gig.id);
            return { ...gig, interested };
          })
        );

        resolve(gigsWithInterested);
      });
    });

    // Get all unique user names
    const allNames = new Set();
    gigs.forEach(gig => {
      gig.interested.forEach(name => allNames.add(name));
    });

    res.json({
      gigs,
      allNames: Array.from(allNames).sort()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ BACKGROUND GIG REFRESH ============

async function refreshGigs() {
  console.log('Refreshing gigs...');
  try {
    const gigs = await fetchAllGigs();
    await insertGigs(gigs);
    console.log(`Refreshed ${gigs.length} gigs`);
  } catch (e) {
    console.error('Refresh error:', e.message);
  }
}

// Refresh on startup
refreshGigs();

// Refresh every 6 hours
setInterval(refreshGigs, 6 * 60 * 60 * 1000);

// ============ SERVER START ============

app.listen(PORT, () => {
  console.log(`Every Note running on port ${PORT}`);
});
