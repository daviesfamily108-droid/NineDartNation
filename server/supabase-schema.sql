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
    prize_type TEXT, -- 'premium', 'cash', 'none'
    prize_amount DECIMAL(10,2),
    currency TEXT,
    payout_status TEXT DEFAULT 'none', -- 'none', 'pending', 'paid'
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'running', 'completed'
    winner_email TEXT,
    winner_name TEXT,
    starting_score INTEGER,
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

-- Wallets for premium purchases
CREATE TABLE IF NOT EXISTS public.wallets (
    email TEXT PRIMARY KEY,
    balances JSONB DEFAULT '{}', -- { 'USD': 1000, 'EUR': 500 } in cents
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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

-- Notifications table for persistent site notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    meta JSONB
);
CREATE INDEX IF NOT EXISTS idx_notifications_email ON public.notifications(email);