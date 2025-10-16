-- Fix for infinite recursion in users table RLS policy
-- This disables RLS on the users table as intended by the schema

-- First, drop any existing policies that might be causing the recursion
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Users can update their own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert their own data" ON public.users;
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.users;

-- Disable Row Level Security for users table
-- Authentication and authorization handled by server-side application logic
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Grant necessary permissions to the service role (if needed)
-- GRANT ALL ON public.users TO service_role;

-- Verify the table structure
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'users' AND schemaname = 'public';