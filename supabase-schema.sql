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
-- Allow users to read their own data
CREATE POLICY "Users can view own data" ON public.users
    FOR SELECT USING (auth.uid()::text = email);

-- Allow users to update their own data
CREATE POLICY "Users can update own data" ON public.users
    FOR UPDATE USING (auth.uid()::text = email);

-- Allow inserts for new user registration
CREATE POLICY "Allow user registration" ON public.users
    FOR INSERT WITH CHECK (true);

-- Allow admins to view all users
CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE email = auth.uid()::text AND admin = true
        )
    );

-- Allow admins to update all users
CREATE POLICY "Admins can update all users" ON public.users
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE email = auth.uid()::text AND admin = true
        )
    );

-- Create an index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- Create an index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);