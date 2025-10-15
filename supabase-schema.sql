-- Create the users table for Nine Dart Nation
CREATE TABLE IF NOT EXISTS public.users (
    email TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    admin BOOLEAN DEFAULT FALSE,
    subscription JSONB DEFAULT '{"fullAccess": false}'
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policies for the users table
-- Allow anyone to check for existing users during signup (for username/email validation)
DROP POLICY IF EXISTS "Allow signup checks" ON public.users;
CREATE POLICY "Allow signup checks" ON public.users
    FOR SELECT USING (true);

-- Allow users to read their own data
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
CREATE POLICY "Users can view own data" ON public.users
    FOR SELECT USING (auth.uid()::text = email);

-- Allow users to update their own data
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can update own data" ON public.users
    FOR UPDATE USING (auth.uid()::text = email);

-- Allow inserts for new user registration
DROP POLICY IF EXISTS "Allow user registration" ON public.users;
CREATE POLICY "Allow user registration" ON public.users
    FOR INSERT WITH CHECK (true);

-- Note: Admin policies removed to avoid infinite recursion
-- Admin access is handled by server-side application logic

-- Create an index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);