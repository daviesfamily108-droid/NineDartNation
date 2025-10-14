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

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to read their own data
-- (You'll need to adjust this based on your authentication setup)
-- For now, we'll allow all operations (adjust for production)
CREATE POLICY "Allow all operations for users" ON users
  FOR ALL USING (true);