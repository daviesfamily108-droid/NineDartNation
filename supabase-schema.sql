-- Create the users table for Nine Dart Nation
CREATE TABLE IF NOT EXISTS public.users (
    email TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    admin BOOLEAN DEFAULT FALSE,
    subscription JSONB DEFAULT '{"fullAccess": false}'
);

-- Disable Row Level Security for users table
-- Authentication and authorization handled by server-side application logic
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Create an index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);