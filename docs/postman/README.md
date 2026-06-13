# Artivaa Postman Collection

## Import

1. Open Postman → **Import**
2. Add files:
   - `Artivaa-API.postman_collection.json`
   - `Artivaa-API.postman_environment.json` (local)
   - `Artivaa-API-Production.postman_environment.json` (Render)

## Get Clerk token

1. Sign in on web app (Vercel or localhost)
2. DevTools → **Network** → any request to `/api/meetings`
3. Copy `Authorization: Bearer eyJ...` → paste into env variable `clerkToken` (without "Bearer ")

Or: Clerk Dashboard → Users → Sessions → copy JWT.

## Test flow

1. Select environment (Local or Production)
2. Set `clerkToken`
3. **Health Check** (no auth)
4. **Get My Profile**
5. **List Meetings** → copy an `id` into `meetingId`
6. **Get Meeting by ID** / **Start Bot**

## Auth note

Collection default auth = Bearer `{{clerkToken}}`.  
Public routes (health, invite validate, bot upload) override with no auth.
