const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const https = require('https');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

app.use(bodyParser.json());
app.use(express.static('public'));

// Disable caching for API routes
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

console.log('Connected to Supabase database');

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

// ============ GIG SCRAPERS ============

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
  venue = venue.replace(/https?:\/\/[^\s]+/g, '').trim();
  venue = venue.replace(/-\s*$/, '').trim();

  if (venue.toLowerCase().includes('st george')) {
    return 'St George\'s Bristol';
  }

  if (venue.includes('Bristol Beacon') || venue.includes('Lantern Hall')) {
    return 'Bristol Beacon';
  }

  if (venue.toLowerCase().includes('various venues')) {
    return venue.split(/[-–]/)[0].trim();
  }

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
        venue = normalizeVenue(venue) || 'Check venue';
        const hrefMatch = desc.match(/href="([^"]+)"/);
        const plainUrl = desc.match(/https?:\/\/[^\s<"]+/);
        const url = hrefMatch ? hrefMatch[1] : (plainUrl ? plainUrl[0] : '');

        let cleanDesc = '';
        if (e.description) {
          cleanDesc = e.description
            .replace(/<[^>]+>/g, '')
            .replace(/https?:\/\/[^\s]+/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);
        }

        return {
          title: e.title,
          date: e.start,
          venue,
          url,
          source: 'Bristol Jazz Live',
          genres: JSON.stringify(['Jazz']),
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

    const descMatch = card.match(/c-col-card__desc[^>]*>([^<]+)<\/div/i);
    const description = descMatch ? descMatch[1].trim().substring(0, 300) : '';

    events.push({
      title,
      date: date ? date.toISOString() : dateRaw,
      venue: 'St George\'s Bristol',
      url,
      source: 'St George\'s Bristol',
      genres: category ? JSON.stringify([category]) : null,
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

    return gigs;
  } catch (e) {
    console.error('Error fetching gigs:', e.message);
    return [];
  }
}

// ============ DATABASE OPERATIONS ============

async function getOrCreateVenue(venueName) {
  try {
    // Check if venue exists
    const { data: existing } = await supabase
      .from('venues')
      .select('id')
      .eq('name', venueName)
      .single();

    if (existing) return existing.id;

    // Create new venue
    const venueId = uuidv4();
    const { error } = await supabase
      .from('venues')
      .insert({ id: venueId, name: venueName, city: 'Bristol' });

    if (error) {
      console.error('Error creating venue:', error);
      return null;
    }

    return venueId;
  } catch (e) {
    console.error('Error with venue:', e);
    return null;
  }
}

async function insertGigs(gigs) {
  try {
    for (const gig of gigs) {
      const venueId = await getOrCreateVenue(gig.venue);
      if (!venueId) continue;

      const gigId = uuidv4();
      const { error } = await supabase
        .from('gigs')
        .insert({
          id: gigId,
          venue_id: venueId,
          title: gig.title,
          date: gig.date,
          genres: gig.genres,
          ticket_url: gig.url,
          description: gig.description,
          source: gig.source
        });

      if (error && !error.message.includes('duplicate')) {
        console.error('Insert error:', error);
      }
    }

    // Clean up old gigs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: deleteError } = await supabase
      .from('gigs')
      .delete()
      .lt('date', thirtyDaysAgo);

    if (deleteError) console.error('Cleanup error:', deleteError);
  } catch (e) {
    console.error('Error inserting gigs:', e.message);
  }
}

async function getGigs(filters = {}) {
  try {
    let query = supabase
      .from('gigs')
      .select('id, title, date, ticket_url, description, source, genres, venues(name)');

    const venueSelected = filters.venues && filters.venues.length > 0;

    // Date filters (skip if venue selected)
    if (!venueSelected && filters.startDate) {
      query = query.gte('date', filters.startDate);
    }
    if (!venueSelected && filters.endDate) {
      query = query.lte('date', filters.endDate);
    }

    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      // Note: Full text search would be better, but this works for MVP
      query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }

    query = query.order('date', { ascending: true });

    const { data: gigs, error } = await query;

    if (error) {
      console.error('Error fetching gigs:', error);
      return [];
    }

    // Format results and apply filters in JavaScript
    let results = (gigs || []).map(g => ({
      id: g.id,
      title: g.title,
      date: g.date,
      venue: g.venues?.name || 'Unknown Venue',
      url: g.ticket_url,
      source: g.source,
      description: g.description,
      categories: g.genres ? JSON.parse(g.genres) : []
    }));

    // Filter by genres
    if (filters.genres && filters.genres.length > 0) {
      results = results.filter(gig =>
        gig.categories.some(cat => filters.genres.includes(cat))
      );
    }

    // Filter by venue
    if (filters.venues && filters.venues.length > 0) {
      results = results.filter(gig =>
        filters.venues.some(v => normalizeVenue(gig.venue) === normalizeVenue(v))
      );
    }

    // Filter out bad entries
    results = results.filter(r => {
      const venueLower = r.venue.toLowerCase();
      const titleLower = r.title.toLowerCase();
      if (venueLower.includes('check venue')) return false;
      if (venueLower.includes('celebrating nat king cole')) return false;
      if (venueLower.includes('various venues')) return false;
      if (titleLower.includes('celebrating nat king cole')) return false;
      return true;
    });

    return results;
  } catch (e) {
    console.error('Error in getGigs:', e);
    return [];
  }
}

async function getVenues() {
  try {
    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('venues(name)');

    if (error) {
      console.error('Error fetching venues:', error);
      return [];
    }

    const venues = new Set();
    (gigs || []).forEach(g => {
      if (g.venues?.name) {
        const normalized = normalizeVenue(g.venues.name);
        const venueLower = normalized.toLowerCase();
        if (!venueLower.includes('check') && !venueLower.includes('celebrating') && !venueLower.includes('various')) {
          venues.add(normalized);
        }
      }
    });

    return Array.from(venues).sort();
  } catch (e) {
    console.error('Error in getVenues:', e);
    return [];
  }
}

async function getGenres() {
  try {
    const { data: gigs, error } = await supabase
      .from('gigs')
      .select('genres');

    if (error) {
      console.error('Error fetching genres:', error);
      return [];
    }

    const genres = new Set();
    (gigs || []).forEach(g => {
      if (g.genres) {
        try {
          const parsed = JSON.parse(g.genres);
          if (Array.isArray(parsed)) {
            parsed.forEach(genre => genres.add(genre));
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });

    return Array.from(genres).sort();
  } catch (e) {
    console.error('Error in getGenres:', e);
    return [];
  }
}

async function addInterest(gigId, userName, status = 'interested') {
  try {
    // Get or create user (temporary approach - will be replaced with proper auth in Phase 0b)
    let { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('username', userName)
      .single();

    let userId = user?.id;
    if (!userId) {
      userId = uuidv4();
      await supabase.from('users').insert({
        id: userId,
        email: `${userName.replace(/\s+/g, '.')}@temporary.local`,
        username: userName,
        password_hash: 'temp_user_no_password'
      });
    }

    // Check if interest already exists
    const { data: existing } = await supabase
      .from('gig_interests')
      .select('id')
      .eq('gig_id', gigId)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // Update existing interest
      const { error } = await supabase
        .from('gig_interests')
        .update({ status })
        .eq('id', existing.id);

      if (error) {
        console.error('Error updating interest:', error);
        return { success: false, error: error.message };
      }
    } else {
      // Insert new interest
      const { error } = await supabase
        .from('gig_interests')
        .insert({
          id: uuidv4(),
          gig_id: gigId,
          user_id: userId,
          status
        });

      if (error) {
        console.error('Error inserting interest:', error);
        return { success: false, error: error.message };
      }
    }

    return { success: true };
  } catch (e) {
    console.error('Error in addInterest:', e);
    return { success: false, error: e.message };
  }
}

async function removeInterest(gigId, userName) {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('username', userName)
      .single();

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const { error } = await supabase
      .from('gig_interests')
      .delete()
      .eq('gig_id', gigId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error removing interest:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (e) {
    console.error('Error in removeInterest:', e);
    return { success: false, error: e.message };
  }
}

async function getInterested(gigId) {
  try {
    const { data, error } = await supabase
      .from('gig_interests')
      .select('users(username), status')
      .eq('gig_id', gigId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching interested:', error);
      return [];
    }

    return (data || []).map(item => ({
      userName: item.users?.username || 'Unknown',
      status: item.status
    }));
  } catch (e) {
    console.error('Error in getInterested:', e);
    return [];
  }
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
    const { gigId, userName, status = 'interested' } = req.body;

    if (!gigId || !userName) {
      return res.status(400).json({ error: 'gigId and userName required' });
    }

    if (userName.trim().length === 0) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    if (userName.length > 100) {
      return res.status(400).json({ error: 'Name too long (max 100 chars)' });
    }

    const validStatuses = ['interested', 'booked', 'going'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await addInterest(gigId, userName.trim(), status);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/interested/:gigId', async (req, res) => {
  try {
    const gigId = req.params.gigId;
    const interested = await getInterested(gigId);
    res.json({ gigId, interested });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/interested/:gigId/:userName', async (req, res) => {
  try {
    const { gigId, userName } = req.params;

    if (!gigId || !userName) {
      return res.status(400).json({ error: 'gigId and userName required' });
    }

    const result = await removeInterest(gigId, decodeURIComponent(userName));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/attendance-summary', async (req, res) => {
  try {
    const gigs = await getGigs({});

    const allNames = new Set();
    const gigsWithInterested = await Promise.all(
      gigs.map(async gig => {
        const interested = await getInterested(gig.id);
        interested.forEach(item => allNames.add(item.userName));
        return { ...gig, interested };
      })
    );

    res.json({
      gigs: gigsWithInterested,
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
