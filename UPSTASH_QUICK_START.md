# Upstash Configuration Summary ✅

## What's Configured

Your Nine Dart Nation server is now fully configured to use Upstash Redis for:

### 1. **Session Management**
- User sessions persist across server restarts
- Cross-server session sharing
- Automatic 1-hour expiry

### 2. **Camera Pairing System**
- QR codes stored with 2-minute expiry
- Multi-device synchronization
- Desktop ↔ Mobile data relay

### 3. **Real-time Features**
- WebSocket room management
- Multi-instance load balancing support
- Cross-server data synchronization

## How to Set Up Upstash

### Step 1: Get Your Credentials
1. Go to https://console.upstash.com/
2. Sign in or create account (free tier available)
3. Create new Redis database
4. Click "REST API" tab
5. Copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

### Step 2: Add to Render (Production)

**For Render Deployment:**
1. Go to your service Settings
2. Navigate to Environment tab
3. Add these variables:
   ```
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token-here
   ```
4. Click "Save" and redeploy

**For Netlify/Vercel:**
- Add same environment variables in your deployment settings
- Function restarts will pick up new configuration

### Step 3: Local Development (Optional)

For testing locally, add to `server/.env`:
```
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

## Verification

### Check Server Logs
When server starts, you should see:
```
[UPSTASH] Redis REST API configured
[UPSTASH] ✓ Connection verified
```

### Test Connection
```bash
# Check if Upstash is working
curl -X POST "https://your-db.upstash.io/ping" \
  -H "Authorization: Bearer your-token"
# Response: {"result":"PONG"}
```

## Features by Configuration Status

### ✅ With Upstash
- Persistent camera pairing codes
- Session data survives restarts
- Multi-server support
- Camera sync across instances
- Real-time room management

### ⚠️ Without Upstash (Fallback)
- Data lost on restart
- Camera pairing codes expire immediately
- Single instance only
- No cross-server sync

## Pricing

**Free Tier**: ✅ $0/month
- 10,000 requests/day
- Great for development and testing
- Sufficient for small deployments

**Pro Tier**: $9+/month
- Unlimited requests
- For production with many users

## File Locations

| File | Purpose |
|------|---------|
| `UPSTASH_SETUP.md` | Detailed setup guide |
| `server/.env` | Local credentials (not committed) |
| `server/server.cjs` | Upstash integration code |

## What Happens Internally

```
User Request
    ↓
Express Server
    ↓
Upstash REST API (if configured)
    ├─ Set/Get user sessions
    ├─ Store camera pairing codes
    └─ Manage room data
    ↓
Response
```

## Next Steps

1. ✅ Get Upstash credentials from console.upstash.com
2. ✅ Add to Render environment variables
3. ✅ Redeploy your service
4. ✅ Verify `[UPSTASH] ✓ Connection verified` in logs

That's it! Your server is now production-ready with persistent Redis storage.

## Support

If connection fails:
- Check credentials are correct (no extra spaces)
- Verify REST API is enabled in Upstash console
- Check network connectivity
- Try the connection test command above

The server will work with or without Upstash, but camera pairing and sessions won't persist.
