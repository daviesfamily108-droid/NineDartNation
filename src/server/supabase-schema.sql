-- Create the users table for Nine Dart Nation
CREATE TABLE IF NOT EXISTS public.users (
    email TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    admin BOOLEAN DEFAULT FALSE,
    subscription JSONB DEFAULT '{"fullAccess": false}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable Row Level Security for users table
-- Authentication and authorization handled by server-side application logic
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Create an index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Rooms table for WebSocket game rooms
CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room members (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.room_members (
    room_id TEXT REFERENCES public.rooms(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    username TEXT,
    email TEXT,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (room_id, client_id)
);

-- Active matches table
CREATE TABLE IF NOT EXISTS public.matches (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    mode TEXT NOT NULL, -- 'bestof' or 'firstto'
    value INTEGER NOT NULL, -- number of legs/sets
    game TEXT NOT NULL, -- 'X01', 'Cricket', etc.
    starting_score INTEGER, -- for X01 games
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'waiting' -- 'waiting', 'active', 'completed'
);

-- Match players
CREATE TABLE IF NOT EXISTS public.match_players (
    match_id TEXT REFERENCES public.matches(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (match_id, player_id)
);

-- Tournaments table
CREATE TABLE IF NOT EXISTS public.tournaments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    game TEXT NOT NULL,
    mode TEXT NOT NULL, -- 'bestof' or 'firstto'
    value INTEGER NOT NULL,
    description TEXT,
    start_at TIMESTAMP WITH TIME ZONE NOT NULL,
    checkin_minutes INTEGER DEFAULT 15,
    capacity INTEGER NOT NULL,
    official BOOLEAN DEFAULT FALSE,
    prize BOOLEAN DEFAULT FALSE,
    prize_type TEXT, -- 'premium', 'none'
    prize_amount DECIMAL(10,2),
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'running', 'completed'
    winner_email TEXT,
    winner_name TEXT,
    starting_score INTEGER,
    require_calibration BOOLEAN DEFAULT FALSE,
    creator_email TEXT,
    creator_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tournament participants
CREATE TABLE IF NOT EXISTS public.tournament_participants (
    tournament_id TEXT REFERENCES public.tournaments(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    username TEXT NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checked_in BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (tournament_id, email)
);

-- Friendships (bidirectional)
CREATE TABLE IF NOT EXISTS public.friendships (
    user_email TEXT NOT NULL,
    friend_email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_email, friend_email),
    CHECK (user_email < friend_email) -- Prevent duplicate friendships
);

-- Camera pairing sessions
CREATE TABLE IF NOT EXISTS public.camera_sessions (
    code TEXT PRIMARY KEY,
    desktop_client_id TEXT NOT NULL,
    phone_client_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON public.rooms(updated_at);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_creator ON public.matches(creator_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_at ON public.tournaments(start_at);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_email ON public.tournament_participants(email);
CREATE INDEX IF NOT EXISTS idx_friendships_user ON public.friendships(user_email);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON public.friendships(friend_email);
CREATE INDEX IF NOT EXISTS idx_camera_sessions_expires ON public.camera_sessions(expires_at);

-- User stats (cross-device sync)
CREATE TABLE IF NOT EXISTS public.user_stats (
    username TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_stats_updated_at ON public.user_stats(updated_at);

-- ============================================================
-- MISSING TABLES — referenced by server.cjs but not yet in schema
-- ============================================================

-- Notifications (server pushes to supabase.from('notifications'))
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'generic',
    read BOOLEAN DEFAULT FALSE,
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_email ON public.notifications(email);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(email, read);

-- Friend requests (server pushes to supabase.from('friend_requests'))
CREATE TABLE IF NOT EXISTS public.friend_requests (
    id TEXT PRIMARY KEY,
    from_email TEXT NOT NULL,
    to_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected'
    ts BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON public.friend_requests(to_email, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_from ON public.friend_requests(from_email);

-- ============================================================
-- NEW TABLES — improve the site with match history & leaderboard
-- ============================================================

-- Match history: persists completed match results so players can review past games.
-- The server currently deletes matches from the matches table on completion;
-- this table preserves a permanent record.
CREATE TABLE IF NOT EXISTS public.match_history (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,                -- 'X01', 'Cricket', etc.
    mode TEXT NOT NULL,                -- 'bestof' or 'firstto'
    value INTEGER NOT NULL,            -- legs/sets target
    starting_score INTEGER,
    winner_email TEXT,
    winner_name TEXT,
    players JSONB NOT NULL,            -- array of { email, name, legsWon, avg3, bestCheckout }
    duration_seconds INTEGER,          -- how long the match lasted
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_match_history_winner ON public.match_history(winner_email);
CREATE INDEX IF NOT EXISTS idx_match_history_completed ON public.match_history(completed_at DESC);
-- GIN index lets us query "all matches a player was in" via JSONB containment
CREATE INDEX IF NOT EXISTS idx_match_history_players ON public.match_history USING GIN (players);

-- Leaderboard: materialised ranking per game mode, refreshed periodically.
-- Keeps the leaderboard query O(1) instead of scanning match_history every time.
CREATE TABLE IF NOT EXISTS public.leaderboard (
    email TEXT NOT NULL,
    username TEXT NOT NULL,
    game TEXT NOT NULL,                -- 'X01-501', 'X01-301', 'Cricket', etc.
    rating INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    avg_3dart NUMERIC(6,2) DEFAULT 0,
    best_checkout INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (email, game)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_game_rating ON public.leaderboard(game, rating DESC);

-- Announcements: persist admin announcements so new/reconnecting clients
-- get the latest announcement from the DB instead of in-memory only.
CREATE TABLE IF NOT EXISTS public.announcements (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    created_by TEXT,                   -- admin email
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcements_latest ON public.announcements(created_at DESC);

-- ============================================================
-- CLEANUP: auto-expire stale rows
-- ============================================================

-- Remove expired camera pairing sessions automatically
CREATE OR REPLACE FUNCTION cleanup_expired_camera_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM public.camera_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Remove stale rooms with no activity for 24 hours
CREATE OR REPLACE FUNCTION cleanup_stale_rooms()
RETURNS void AS $$
BEGIN
    DELETE FROM public.rooms WHERE updated_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;
