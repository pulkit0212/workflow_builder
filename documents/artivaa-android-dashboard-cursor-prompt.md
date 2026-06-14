# Artivaa Android — Dashboard Home Cursor Prompt

> **Copy everything below the line into a new Cursor chat** in the `artivaa-android` project.  
> Last synced with live web: **May 2026** (Meeting Progress card + calendar feed fixes).

---

Fix Artivaa Android Dashboard home screen to match the **LIVE web app** (not wireframes).

READ FIRST (repo docs if present):
- `documents/artivaa-android-compose-plan.md`
- `documents/android_compose_learning.md`
- `documents/artivaa-android-app-design-spec.md`

Web reference files:
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/components/layout/dashboard-header.tsx`
- `frontend/src/app/globals.css`
- `backend/express-api/src/routes/workspaces.ts` (GET `/:workspaceId/dashboard`)
- `backend/express-api/src/routes/action-items.ts` (GET `/stats`)
- `backend/express-api/src/routes/meetings.ts` (GET `/joined`, GET `/calendar-feed`, GET `/reports`)
- `backend/express-api/src/routes/profile.ts` (GET `/me`)

---

## CRITICAL: Field names that DO NOT exist in API

These are **CLIENT-COMPUTED** on web — do NOT expect them from backend:
- `weeklyCompletionRate`
- `actionItemsExtracted`
- `meetingSummaryRate`
- `pendingTasks` (use `stats.actionItems.pending` or `action-items/stats.pending`)
- `thisMonth` (use `stats.meetingsThisMonth` or client month filter)

---

## 1) Personal mode (no workspace selected)

**NO personal workspace ID. NO single dashboard stats endpoint.**

Call these APIs in parallel:

### GET `/api/meetings/joined`
```json
{ "success": true, "meetings": [ "...camelCase meeting rows..." ] }
```

### GET `/api/action-items/stats`
```json
{ "success": true, "total": 24, "pending": 14 }
```
- **Free plan may return 403** (`upgrade_required`) — handle gracefully: treat as `{ total: 0, pending: 0 }`, do not crash.
- Showing **0** on Free for the Action Items stat card is **correct** (hub is gated; do not fall back to summing embedded meeting action items for the stat card when stats API was blocked).

### GET `/api/meetings/calendar-feed?startDate=&endDate=`
Today's window: local **00:00:00.000** → **23:59:59.999**, pass as ISO8601.

```json
{
  "meetings": [
    {
      "id": "google_abc123",
      "title": "Standup",
      "startTime": "2026-05-19T09:00:00.000Z",
      "endTime": "2026-05-19T09:30:00.000Z",
      "meetLink": "https://meet.google.com/...",
      "provider": "google",
      "source": "google_calendar"
    }
  ],
  "partialFailure": {
    "failedProviders": [
      { "provider": "microsoft_teams", "error": "Microsoft token expired. Please reconnect Microsoft Calendar." }
    ]
  }
}
```

**Calendar backend behavior (May 2026):**
- `partialFailure` is returned **only when ALL connected calendars fail** (not when one provider fails and another succeeds).
- Microsoft tokens are auto-refreshed on backend (like Google).

**Build stat cards CLIENT-SIDE from joined meetings + stats API:**

| Stat card | Source |
|-----------|--------|
| Total Meetings | `meetings.length` |
| This Month | count where `scheduledStartTime` or `createdAt` is in current calendar month |
| Action Items | `action-items/stats.total` (403 → **0**) |
| Action Items helper | `{pending} pending` from stats (403 → **0 pending**) |
| Completed | `meetings.filter(hasContent).size` |

```kotlin
fun hasContent(meeting: MeetingSession): Boolean {
    val summary = meeting.summary?.trim().orEmpty()
    val errorPhrases = listOf(
        "not enough content", "summary generation failed",
        "googlegenerativeai", "error fetching"
    )
    val summaryIsError = errorPhrases.any { summary.contains(it, ignoreCase = true) }
    return (summary.isNotEmpty() && !summaryIsError)
        || !meeting.transcript.isNullOrBlank()
        || meeting.status == "completed"
        || !meeting.keyPoints.isNullOrEmpty()
        || !meeting.actionItems.isNullOrEmpty()
}
```

**Recent Reports table** on dashboard = first **5** meetings from joined that pass `hasContent` — **NOT** `GET /api/meetings/reports`.

---

## 2) Workspace mode (workspace selected)

Call in parallel:

### GET `/api/workspace/{workspaceId}/meetings`
Response: **array** of camelCase meeting rows **OR** `{ "meetings": [] }` — handle both.

### GET `/api/workspace/{workspaceId}/dashboard`
(alias: `GET /api/workspaces/{workspaceId}/dashboard`)

```json
{
  "workspace": {
    "id": "uuid",
    "name": "Acme Team",
    "type": "team",
    "owner_id": "uuid",
    "created_at": "ISO8601",
    "updated_at": "ISO8601"
  },
  "stats": {
    "totalMembers": 5,
    "totalMeetings": 42,
    "meetingsThisMonth": 8,
    "actionItems": {
      "total": 24,
      "completed": 10,
      "pending": 14
    }
  },
  "recentMeetings": [
    { "id": "uuid", "title": "...", "status": "completed", "created_at": "ISO8601" }
  ]
}
```

**Note:** `workspace` + `recentMeetings` are **snake_case** from Postgres. `stats` is **camelCase**.

Use `stats` for stat cards in workspace mode. **Hide** "Today's Meetings" calendar section (web shows workspace context instead — no calendar feed in workspace mode on dashboard).

---

## 3) GET `/api/meetings/reports` (Reports PAGE only — NOT dashboard home)

```json
{
  "success": true,
  "meetings": [ "..." ],
  "pagination": { "total": 42, "page": 1, "limit": 20, "totalPages": 3 }
}
```

Query: `page`, `limit`, `status`, `date` (`all|week|month`), `search`  
Header: optional `x-workspace-id`

---

## 4) GET `/api/action-items/stats`

```json
{ "success": true, "total": number, "pending": number }
```

NO `"extracted"`, NO `"completed"` in this endpoint.  
Optional header: `x-workspace-id` for workspace scope.

---

## 5) GET `/api/profile/me`

Actual backend shape (**NOT** `{ success, profile }`):

```json
{
  "user": {
    "id": "uuid",
    "clerkUserId": "user_xxx",
    "email": "user@example.com",
    "fullName": "Pulkit Sharma",
    "plan": "pro",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  },
  "subscription": {
    "plan": "pro",
    "status": "active",
    "trialStartedAt": null,
    "trialEndsAt": null,
    "planStartedAt": "ISO8601",
    "planEndsAt": "ISO8601",
    "meetingsUsedThisMonth": 5,
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

There is **NO** `firstName` / `lastName` — only `user.fullName`.

---

## 6) Meeting Progress card (PURPLE GRADIENT) — 100% CLIENT SIDE

> **Renamed from "Weekly Efficiency" (May 2026).** Do NOT mention action items on this card.

**Title:** `Meeting Progress`

```kotlin
val completedCount = meetings.count { hasContent(it) }
val totalMeetings = meetings.size
val meetingSummaryRate = if (totalMeetings > 0) {
    ((completedCount * 100f) / totalMeetings).roundToInt()
} else 0
```

**UI copy (match web `page.tsx` ~477–487):**
- Big number: `{meetingSummaryRate}%`
- Label beside number: `with AI summaries`
- Progress bar width = `meetingSummaryRate`%
- Footer: `{completedCount} of {totalMeetings} meeting(s) processed with summaries or transcripts.`

**Do NOT use:**
- ~~`Weekly Efficiency`~~
- ~~`{totalActionItems} action items extracted from {N} meetings`~~ (misleading on Free plan when Action Items stat = 0)

Action items belong only on the **Action Items stat card**, not this purple card.

---

## 7) Today's Meetings — calendar empty states (personal mode only)

Evaluate in this order (match web `page.tsx` ~305–379):

| # | Condition | UI |
|---|-----------|-----|
| 1 | `calendarMeetings.isNotEmpty()` | Show today's meeting cards (platform badge, time range, status, Start AI Notetaker) |
| 2 | `partialFailure != null` (all calendars failed) | **"Calendar needs reconnecting"** + first error message + **Reconnect Calendar** → Integrations |
| 3 | No calendar connected (`meetings.isEmpty()` && no `partialFailure`) | **"No calendar connected"** + Connect Calendar CTA |
| 4 | Calendar OK but 0 events today | **"No meetings scheduled today"** + helper text |

**Do NOT show** a separate yellow banner like ~~"Some calendars couldn't be loaded"~~ — the reconnect empty state replaces it.

`noCalendarConnected` logic:
```kotlin
val noCalendarConnected = feed.meetings.isEmpty() && feed.partialFailure == null
```

---

## 8) Top bar / header (match web — NO "Good morning")

`dashboard-header.tsx` shows:
- **Title:** page name e.g. `"Dashboard"` (Work Sans 22sp, weight 500, `#202124`)
- **Subtitle:** weekday + date e.g. `"Wednesday, May 19"` (Inter 12sp, `#5F6368`)
- **NOT** a user greeting in header (name is in sidebar/avatar only)

Fonts/colors from `globals.css`:
- Primary: `#6C3FF5`, Primary dark: `#5B2FE0`, Primary light: `#EDE9FE`
- Background: `#F8F9FA`, Surface: `#FFFFFF`, Border: `#DADCE0`
- Text: `#202124`, Secondary: `#5F6368`
- Work Sans = titles, Inter = body (14px / 20px line-height)

---

## 9) Dashboard UI sections (match web `page.tsx`)

**TOP:** 4 stat cards (2×2 mobile, 4 col tablet)
- Total Meetings | This Month | Action Items (`X pending`) | Completed

**MAIN LEFT:**
- Personal: **"Today's Meetings"** from calendar feed OR empty states (§7)
- Workspace: skip calendar section
- **"Recent Reports"** table: title, date, status badge, View Report / Retry / Processing
- Footer: `"Showing N of M reports"` + View all → Reports screen

**MAIN RIGHT:**
- **Meeting Progress** gradient card (`#6C3FF5` → `#5B2FE0`)
- Quick Actions: Record Live Audio, Connect Calendar

**Status badge colors:**
- completed / Ready: bg `#E6F4EA`, text `#137333`
- processing: bg `#FEF7E0`, text `#B06000`
- failed: bg `#FCE8E6`, text `#C5221F`
- upcoming: bg `#EDE9FE`, text `#6C3FF5`

---

## 10) What to fix in Android project

1. Remove wrong API fields (`weeklyCompletionRate`, `actionItemsExtracted`, `meetingSummaryRate` from API models).
2. Split `DashboardRepository` / `ViewModel`: `loadPersonalDashboard()` vs `loadWorkspaceDashboard()`.
3. Parse workspace dashboard with mixed snake_case + camelCase.
4. Compute **Meeting Progress** locally in ViewModel — never from API.
5. Dashboard home uses `/meetings/joined` — **NOT** `/meetings/reports`.
6. Add calendar feed DTO with optional `partialFailure.failedProviders[]`.
7. Implement 4 calendar empty states (§7) — no generic warning banner.
8. Header: `"Dashboard"` + date only.
9. Profile DTO: `user.fullName`, not `firstName`/`lastName`.
10. Handle `action-items/stats` 403 on Free plan without crashing (show 0).
11. Rename purple card UI from ~~Weekly Efficiency~~ → **Meeting Progress**.
12. Add `@Preview` + mock JSON matching exact shapes above.

**Networking:**
- Base URL: `https://artivaa-backend.onrender.com` (or env)
- Auth: `Authorization: Bearer <clerk_jwt>`
- Workspace header: `x-workspace-id: {uuid}` when workspace selected

**After changes**, list files changed and confirm:
- Stat card formulas match web `page.tsx` lines **237–263**
- Meeting Progress card matches web `page.tsx` lines **477–487**
- Calendar empty states match web `page.tsx` lines **349–379**
