-- Create the users table in Supabase
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Disable Row Level Security (RLS) for server-managed `users` table
-- The application uses the service role key for server-side operations
ALTER TABLE IF EXISTS public.users DISABLE ROW LEVEL SECURITY;

-- NOTE: Do NOT create permissive policies here. If you need RLS,
-- create narrowly-scoped policies that do NOT reference the users table
-- in a way that could recurse. For this project we keep RLS disabled.