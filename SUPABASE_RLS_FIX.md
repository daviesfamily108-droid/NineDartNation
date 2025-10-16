# Supabase RLS Policy Fix

## Problem
The application is failing to start with the error:
```
[DB] Failed to load users from Supabase: {
  code: '42P17',
  details: null,
  hint: null,
  message: 'infinite recursion detected in policy for relation "users"'
}
```

## Root Cause
This error occurs when Row Level Security (RLS) policies on the `users` table create an infinite recursion. This typically happens when:
- A policy references the same table it's defined on
- Policies have circular dependencies
- The policy logic creates an infinite loop

## Solution

### Option 1: Disable RLS (Recommended)
The application schema is designed to handle authentication server-side, so RLS should be disabled for the users table.

1. Go to your Supabase Dashboard
2. Navigate to the SQL Editor
3. Run the `fix_supabase_rls.sql` script in this directory

### Option 2: Manual Fix
If you prefer to fix manually:

1. Go to your Supabase Dashboard → Table Editor
2. Select the `users` table
3. Go to the "RLS Policies" tab
4. Delete any existing policies on the users table
5. Disable RLS for the users table

### Option 3: Use Service Role Key
The application uses the service role key which should bypass RLS, but if policies are incorrectly configured, they can still cause issues.

## Verification
After applying the fix:
1. The server should start without the RLS error
2. Users should be able to sign up and log in normally
3. Data should persist to Supabase

## Prevention
- Avoid creating RLS policies on tables that the service role needs to access
- Use service role key for server-side operations that need unrestricted access
- Test policy changes in a development environment first

## Temporary Workaround
The server code has been updated to gracefully handle Supabase errors and fall back to in-memory storage, so the application will continue to work even with RLS issues.