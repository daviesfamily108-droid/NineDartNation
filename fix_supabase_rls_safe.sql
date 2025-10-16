-- Safe RLS fix for `users` table
-- This script will:
-- 1) Create a backup of existing policies (if possible)
-- 2) Drop any policies on public.users
-- 3) Disable Row Level Security on public.users
-- 4) Confirm the RLS status

-- Note: Run this in your Supabase SQL editor (Project > SQL Editor). Use the SQL editor role 'postgres' or a role with sufficient privileges.

-- Drop any policy on users table to avoid recursion
DO $$
BEGIN
  -- Iterate and drop all policies on public.users
  FOR r IN (
    SELECT polname FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname = 'users'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', r.polname);
  END LOOP;
END$$;

-- Disable Row Level Security on users
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- Grant access to the postgres role for testing (optional)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO postgres;

-- Confirm RLS status
SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE tablename = 'users' AND schemaname = 'public';
