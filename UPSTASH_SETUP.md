# Upstash Redis Configuration Guide

## What is Upstash?

Upstash is a serverless Redis database service. We use it for:
- Session storage across multiple server instances
- Camera pairing codes (temporary)
- Real-time room memberships
- Cross-server data persistence

## Setup Steps

### 1. Create an Upstash Account
1. Go to https://console.upstash.com/
2. Sign up (free tier available)
3. Create a new Redis database (free tier gives you 10,000 requests/day)

### 2. Get Your Credentials
1. Once created, open your database
2. Click "REST API" tab
3. Copy these values:
   - **UPSTASH_REDIS_REST_URL** - The REST endpoint URL (looks like `https://your-name-us1-redis.upstash.io`)
   - **UPSTASH_REDIS_REST_TOKEN** - The authentication token

### 3. Local Development Setup

#### Option A: Using .env file
```bash
# Open server/.env and add:
UPSTASH_REDIS_REST_URL=https://your-name-us1-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

Then restart the server:
```bash
npm run dev
```

#### Option B: Using Environment Variables (Windows)
```powershell
$env:UPSTASH_REDIS_REST_URL="https://your-name-us1-redis.upstash.io"
$env:UPSTASH_REDIS_REST_TOKEN="your-token-here"
npm run dev
```

### 4. Render Deployment Setup

1. Go to your Render service settings
2. Navigate to **Environment**
3. Add these variables:
   ```
   UPSTASH_REDIS_REST_URL=https://your-name-us1-redis.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token-here
   ```
4. Redeploy the service

## Verification

### Check Connection Status
When the server starts, you should see:
```
[UPSTASH] Redis REST API configured
[UPSTASH] ✓ Connection verified
```

### Test the API
```bash
curl -X POST "https://your-name-us1-redis.upstash.io/set/test" \
  -H "Authorization: Bearer your-token-here" \
  -H "Content-Type: application/json" \
  -d '{"value":"hello"}'

curl "https://your-name-us1-redis.upstash.io/get/test" \
  -H "Authorization: Bearer your-token-here"
```

## Features Enabled by Upstash

✅ **Camera Pairing** - QR codes expire after 2 minutes  
✅ **Session Persistence** - User sessions persist across server restarts  
✅ **Multi-Server** - Multiple instances share the same data  
✅ **Real-time Sync** - Cross-server WebSocket room management  

## Troubleshooting

### "Connection test warning"
- **Cause**: Credentials not set or invalid token
- **Fix**: Verify credentials in `.env` or environment variables

### Timeout Issues
- **Cause**: Network connectivity or Upstash down
- **Fix**: Check Upstash dashboard status at https://console.upstash.com/

### Data Not Persisting
- **Cause**: Server fallback to in-memory storage
- **Fix**: Check `[UPSTASH]` log messages for errors

## Fallback Behavior

If Upstash is not configured or unavailable:
- ✓ Server still works locally with in-memory storage
- ⚠ Data is lost on server restart
- ⚠ Camera pairing codes don't sync across servers
- ⚠ Only works for single-instance deployments

## Pricing

**Free Tier**: 10,000 requests/day (sufficient for most users)  
**Pro Tier**: $9/month for higher limits

For a production app with thousands of users, you may need to upgrade to a paid plan.

## API Reference

Upstash supports the following commands via REST:
- `GET /get/{key}` - Get value
- `POST /set/{key}` - Set value with optional `ex` (expiry in seconds)
- `POST /del/{key}` - Delete key
- `POST /ping` - Test connection
- `POST /incr/{key}` - Increment counter
- `POST /expire/{key}` - Set expiry

See: https://upstash.com/docs/redis/features/rest-api
