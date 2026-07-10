-- Phase 0 Database Schema for Supabase PostgreSQL

-- VENUES table
CREATE TABLE venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT DEFAULT 'Bristol',
  website TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- USERS table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_url TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- FRIENDS table
CREATE TABLE friends (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  friend_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, friend_user_id)
);

-- GIGS table
CREATE TABLE gigs (
  id TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues(id),
  artist_name TEXT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  genres TEXT,
  ticket_url TEXT,
  ticket_price DECIMAL(10, 2),
  description TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(title, date, venue_id)
);

-- GIG_INTERESTS table
CREATE TABLE gig_interests (
  id TEXT PRIMARY KEY,
  gig_id TEXT NOT NULL REFERENCES gigs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'interested',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(gig_id, user_id)
);

-- INVITE_LINKS table
CREATE TABLE invite_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token TEXT UNIQUE NOT NULL,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
