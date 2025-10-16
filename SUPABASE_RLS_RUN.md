Steps to apply RLS fix and verify Stripe checkout

1) Run the safe RLS fix in Supabase
- Open your Supabase project -> SQL Editor
- Create a new query and paste the contents of `fix_supabase_rls_safe.sql` (file in repo root)
- Run the query. You should see a result showing `rowsecurity` = false for `public.users`.

2) Confirm in Supabase UI
- Go to Table Editor -> `users` -> Row Level Security
- Confirm RLS is disabled and there are no policies listed

3) Confirm Render environment variables
- In Render dashboard for your backend service, confirm these env vars exist and are correct:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY (must be the service role key)
  - STRIPE_SECRET_KEY
  - STRIPE_PRICE_ID_SUBSCRIPTION
  - STRIPE_PRICE_ID_USERNAME_CHANGE (optional)

4) Restart your backend on Render
- Use the Restart/Manual Deploy button in Render, not just redeploy
- Watch the logs during startup: you should see either a successful load of users
  or a message that Supabase is configured. Look for errors.

5) Test the Stripe flow
- Open your frontend and click Subscribe -> Observe the Render logs for the request
- If the server returns 500, copy the Render log lines around the error and share them

If the issue persists, check the Render logs for the exact error and send me the output.
