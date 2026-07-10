const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');

// Supabase credentials
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Connect to SQLite
const db = new sqlite3.Database('./gigs.db', (err) => {
  if (err) {
    console.error('Error connecting to SQLite:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database');
});

async function migrate() {
  try {
    console.log('Starting migration...\n');

    // 1. Fetch all gigs from SQLite
    const gigs = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM gigs', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    console.log(`Found ${gigs.length} gigs in SQLite`);

    // 2. Fetch all interests from SQLite
    const interests = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM interested', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    console.log(`Found ${interests.length} interests in SQLite\n`);

    // 3. Create venues from gigs (deduplicated)
    const venueMap = new Map(); // venue name -> id
    const uniqueVenues = [...new Set(gigs.map(g => g.venue))];

    console.log(`Creating ${uniqueVenues.length} venues...`);
    for (const venueName of uniqueVenues) {
      const venueId = randomUUID();
      venueMap.set(venueName, venueId);

      const { error } = await supabase
        .from('venues')
        .insert({
          id: venueId,
          name: venueName,
          city: 'Bristol',
          is_verified: false
        });

      if (error && !error.message.includes('duplicate')) {
        console.error(`Error inserting venue ${venueName}:`, error);
      }
    }
    console.log('Venues created\n');

    // 4. Create gigs
    console.log(`Creating ${gigs.length} gigs...`);
    let gigMap = new Map(); // old gig id -> new gig id

    for (const gig of gigs) {
      const newGigId = randomUUID();
      const venueId = venueMap.get(gig.venue);

      const { error } = await supabase
        .from('gigs')
        .insert({
          id: newGigId,
          venue_id: venueId,
          title: gig.title,
          date: gig.date,
          genres: gig.category ? JSON.stringify([gig.category]) : null,
          ticket_url: gig.url,
          description: gig.description,
          source: gig.source,
          created_at: gig.created_at
        });

      if (error && !error.message.includes('duplicate')) {
        console.error(`Error inserting gig ${gig.title}:`, error);
      } else {
        gigMap.set(gig.id, newGigId);
      }
    }
    console.log('Gigs created\n');

    // 5. Migrate interests (as gig_interests without user_id - will be cleaned up when auth is ready)
    console.log(`Migrating ${interests.length} interests...`);
    for (const interest of interests) {
      const newGigId = gigMap.get(interest.gig_id);
      if (!newGigId) {
        console.log(`Skipping interest for deleted gig ${interest.gig_id}`);
        continue;
      }

      // For now, create a temporary user per username so we don't lose data
      // This will be replaced when proper auth is added
      const tempUserId = randomUUID();

      const { error: userError } = await supabase
        .from('users')
        .insert({
          id: tempUserId,
          email: `${interest.user_name.replace(/\s+/g, '.')}@temporary.local`,
          username: interest.user_name,
          password_hash: 'temp_user_no_password',
          is_public: false
        })
        .eq('username', interest.user_name)
        .single();

      // If user already exists, get their ID
      let userId = tempUserId;
      if (userError && !userError.message.includes('duplicate')) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('username', interest.user_name)
          .single();
        if (existingUser) userId = existingUser.id;
      }

      const { error: interestError } = await supabase
        .from('gig_interests')
        .insert({
          id: randomUUID(),
          gig_id: newGigId,
          user_id: userId,
          status: interest.status || 'interested',
          created_at: interest.created_at
        });

      if (interestError && !interestError.message.includes('duplicate')) {
        console.error(`Error migrating interest:`, interestError);
      }
    }
    console.log('Interests migrated\n');

    console.log('✅ Migration complete!');
    console.log('\nSummary:');
    console.log(`- ${uniqueVenues.length} venues created`);
    console.log(`- ${gigs.length} gigs created`);
    console.log(`- ${interests.length} interests migrated`);
    console.log('\n⚠️  Note: Temporary user accounts were created from interest usernames.');
    console.log('These will be replaced when proper auth is implemented in Phase 0b.');

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
