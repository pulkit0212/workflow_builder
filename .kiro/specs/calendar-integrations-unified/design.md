# Design Document: Calendar Integrations Unified

## Overview

The app currently fetches meetings exclusively from Google Calendar via the `user_integrations` table (provider = `"google"`). Users who schedule meetings through Microsoft Teams or Outlook Calendar see nothing on the Dashboard or Meetings page.

This feature extends the system to support three calendar providers — Google Calendar, Microsoft Teams (via Microsoft Graph), and Outlook Calendar (also via Microsoft Graph) — and introduces a **Unified Calendar Feed** API that merges results from all connected providers into a single response. The Integrations page is also updated to surface all calendar providers alongside the existing non-calendar integrations (Slack, Email, Notion, Jira).

Key design decisions:
- Reuse the existing `user_integrations` table with new provider values (`"microsoft_teams"`, `"microsoft_outlook"`) rather than creating a new table, keeping the OAuth token storage pattern consistent.
- Introduce a new `/api/meetings/calendar-feed` endpoint as the Unified Calendar Feed; the Dashboard and Meetings page migrate to this endpoint.
- The Integrations page is split into two visual sections: **Calendar Connections** (OAuth-based) and **Productivity Tools** (webhook/config-based), preserving all existing non-calendar integration behavior.
- Microsoft Teams and Outlook Calendar both use the Microsoft Graph API with the same OAuth flow (Azure AD), differentiated only by the provider label stored in `user_integrations`.

---

## Architecture

```mermaid
graph TD
    subgraph Frontend
        IP[Integrations Page]
        DB[Dashboard]
        MP[Meetings Page]
    end

    subgraph API Routes
        CF[/api/meetings/calendar-feed]
        CAL_CONNECT[/api/calendar/connect/:provider]
        CAL_CALLBACK[/api/calendar/callback/:provider]
        CAL_DISCONNECT[/api/calendar/disconnect/:provider]
        INT[/api/integrations existing]
    end

    subgraph Calendar Providers
        GC[Google Calendar API]
        MG[Microsoft Graph API]
    end

    subgraph DB
        UI[(user_integrations)]
        INT_TABLE[(integrations)]
    end

    IP -->|OAuth initiate| CAL_CONNECT
    CAL_CONNECT -->|redirect| GC
    CAL_CONNECT -->|redirect| MG
    GC -->|callback| CAL_CALLBACK
    MG -->|callback| CAL_CALLBACK
    CAL_CALLBACK -->|upsert tokens| UI
    IP -->|disconnect| CAL_DISCONNECT
    CAL_DISCONNECT -->|delete/clear tokens| UI

    DB -->|fetch unified feed| CF
    MP -->|fetch unified feed| CF
    CF -->|query tokens| UI
    CF -->|fetch events| GC
    CF -->|fetch events| MG

    IP -->|manage non-calendar integrations| INT
    INT -->|read/write| INT_TABLE
```

---

## Components and Interfaces

### 1. Integrations Page (`/dashboard/integrations/page.tsx`)

The page is restructured into two sections:

**Calendar Connections section** — new, rendered above the existing tools section:
- One card per provider: Google Calendar, Microsoft Teams, Outlook Calendar
- Each card shows: provider name, description, icon, connected status badge, and a Connect/Disconnect button
- Connect triggers the OAuth flow; Disconnect calls the disconnect API
- Connected state is derived from `GET /api/calendar/status` (returns which providers have active tokens)

**Productivity Tools section** — existing Slack, Email, Notion, Jira cards, unchanged in behavior.

### 2. Calendar OAuth API Routes

Three new Next.js API routes under `/api/calendar/`:

```
GET  /api/calendar/status
     → { google: boolean, microsoft_teams: boolean, microsoft_outlook: boolean }

GET  /api/calendar/connect/:provider
     → 302 redirect to provider OAuth authorization URL
     provider: "google" | "microsoft_teams" | "microsoft_outlook"

GET  /api/calendar/callback/:provider
     → handles OAuth callback, stores tokens, redirects to /dashboard/integrations

POST /api/calendar/disconnect/:provider
     → clears tokens from user_integrations for the given provider
```

### 3. Unified Calendar Feed API (`/api/meetings/calendar-feed`)

```
GET /api/meetings/calendar-feed?startDate=ISO&endDate=ISO
```

Response shape:
```typescript
type CalendarFeedResponse = {
  meetings: UnifiedCalendarMeeting[];
  partialFailure?: {
    failedProviders: Array<{ provider: string; error: string }>;
  };
};

type UnifiedCalendarMeeting = {
  id: string;           // provider-prefixed: "google_<eventId>", "teams_<eventId>", etc.
  title: string;
  startTime: string;    // ISO 8601
  endTime: string;      // ISO 8601
  meetLink: string | null;
  provider: "google" | "microsoft_teams" | "microsoft_outlook";
  source: "google_calendar" | "microsoft_teams" | "microsoft_outlook";
};
```

The handler:
1. Resolves the authenticated user
2. Loads all `user_integrations` rows for the user where provider is one of the three calendar providers
3. For each connected provider, fetches events in parallel using the provider-specific client
4. Merges results, sorts by `startTime`
5. On partial failure, returns available meetings plus a `partialFailure` object

### 4. Provider Calendar Clients

New modules under `frontend/src/lib/calendar/`:

```
frontend/src/lib/calendar/
  types.ts          — UnifiedCalendarMeeting type, CalendarClient interface
  google.ts         — wraps existing fetchGoogleCalendarMeetingsForDay
  microsoft.ts      — Microsoft Graph calendar client (Teams + Outlook)
  feed.ts           — fetchUnifiedCalendarFeed(userId, startDate, endDate)
```

**`CalendarClient` interface:**
```typescript
interface CalendarClient {
  fetchMeetings(params: {
    accessToken: string;
    refreshToken: string | null;
    userId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<UnifiedCalendarMeeting[]>;
}
```

### 5. Microsoft Graph Integration

Microsoft Teams and Outlook Calendar both authenticate via Azure AD OAuth 2.0. The same OAuth app handles both; the provider label (`microsoft_teams` vs `microsoft_outlook`) is set based on which card the user clicked on the Integrations page.

Scopes required: `Calendars.Read offline_access`

Token storage: reuses `user_integrations` table with `provider = "microsoft_teams"` or `"microsoft_outlook"`.

Token refresh: same pattern as Google — check expiry before each API call, refresh if within 60 seconds of expiry.

Microsoft Graph endpoint used:
```
GET https://graph.microsoft.com/v1.0/me/calendarView
    ?startDateTime=<ISO>&endDateTime=<ISO>
    &$select=id,subject,start,end,onlineMeeting,webLink
```

### 6. Updated `GoogleCalendarMeeting` type

The existing `GoogleCalendarMeeting` type in `frontend/src/lib/google/types.ts` is extended to become `UnifiedCalendarMeeting` (or the existing type is kept for backward compatibility and the unified type is a superset). The `provider` field already exists on `GoogleCalendarMeeting` as `"google_meet"` — the unified type broadens this to `"google" | "microsoft_teams" | "microsoft_outlook"`.

The `CalendarMeetingRow` component already reads `meeting.provider` to determine the platform badge; it will be updated to handle the new provider values.

---

## Data Models

### `user_integrations` table (existing, extended)

No schema migration needed. New rows are inserted with the new provider values:

| Column | Existing values | New values |
|---|---|---|
| `provider` | `"google"` | `"microsoft_teams"`, `"microsoft_outlook"` |
| `scopes` | Google scopes | `"Calendars.Read offline_access"` |
| `access_token` | Google access token | Microsoft access token |
| `refresh_token` | Google refresh token | Microsoft refresh token |
| `expiry` | Google token expiry | Microsoft token expiry |

### `UnifiedCalendarMeeting` (new TypeScript type)

```typescript
// frontend/src/lib/calendar/types.ts
export type CalendarProvider = "google" | "microsoft_teams" | "microsoft_outlook";

export type UnifiedCalendarMeeting = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  meetLink: string | null;
  provider: CalendarProvider;
  source: "google_calendar" | "microsoft_teams" | "microsoft_outlook";
};

export type CalendarFeedResponse = {
  meetings: UnifiedCalendarMeeting[];
  partialFailure?: {
    failedProviders: Array<{ provider: CalendarProvider; error: string }>;
  };
};
```

### Calendar Integration Status (in-memory, derived)

The Integrations page derives connected state by calling `GET /api/calendar/status`, which queries `user_integrations` for the presence of non-expired (or refreshable) tokens per provider.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Unified feed only includes meetings from connected providers

*For any* user with a subset of calendar providers connected, the unified calendar feed should contain only meetings whose `provider` field matches one of the connected providers — never meetings from a disconnected provider.

**Validates: Requirements 4.4, 6.2, 6.3, 7.4**

---

### Property 2: Every meeting in the feed carries a provider field

*For any* unified calendar feed response, every `UnifiedCalendarMeeting` in the `meetings` array must have a non-empty `provider` field that is one of `"google"`, `"microsoft_teams"`, or `"microsoft_outlook"`.

**Validates: Requirements 4.2, 5.2, 7.3, 7.6**

---

### Property 3: Partial failure preserves available meetings

*For any* scenario where one provider's API call fails and at least one other provider is connected and succeeds, the feed response must include the meetings from the succeeding provider(s) and include a `partialFailure` object listing the failing provider — the response must not be empty or an error.

**Validates: Requirements 7.5**

---

### Property 4: Disconnect removes provider meetings from feed

*For any* user who disconnects a calendar provider, subsequent calls to the unified feed must not include any meetings with that provider's value in the `provider` field.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

---

### Property 5: OAuth connect round-trip stores valid tokens

*For any* successful OAuth authorization flow for a calendar provider, the resulting `user_integrations` row for that provider must have a non-null `access_token` and the `provider` field must match the provider that initiated the flow.

**Validates: Requirements 3.2, 3.4**

---

### Property 6: Integration page displays all seven integrations

*For any* authenticated user visiting the Integrations page, the rendered page must contain cards for all three calendar providers (Google Calendar, Microsoft Teams, Outlook Calendar) and all four non-calendar integrations (Slack, Email, Notion, Jira).

**Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4**

---

### Property 7: Feed respects the requested date range

*For any* call to the unified calendar feed with a `startDate` and `endDate`, all returned meetings must have `startTime >= startDate` and `startTime <= endDate`.

**Validates: Requirements 7.1, 7.2**

---

## Error Handling

| Scenario | Behavior |
|---|---|
| OAuth flow cancelled or denied by user | Redirect back to `/dashboard/integrations` with `?error=oauth_cancelled`; page shows descriptive toast |
| OAuth callback receives invalid state/code | Return 400, redirect to integrations page with `?error=oauth_failed` |
| Provider API call fails during feed fetch | Include provider in `partialFailure`; return remaining meetings with HTTP 200 |
| Token refresh fails (revoked refresh token) | Mark integration as disconnected (clear tokens), return `calendar_auth_required` error for that provider |
| All providers fail during feed fetch | Return HTTP 200 with empty `meetings` array and `partialFailure` listing all providers |
| User disconnects a provider that has no stored tokens | No-op, return success |
| Microsoft Graph returns 401 | Attempt token refresh; if refresh fails, mark as disconnected |
| Date range parameter missing or invalid | Return HTTP 400 with descriptive message |

---

## Testing Strategy

### Unit Tests

Focus on specific examples, integration points, and error conditions:

- `fetchUnifiedCalendarFeed` returns empty array when no providers are connected
- `fetchUnifiedCalendarFeed` correctly merges results from two providers
- `fetchUnifiedCalendarFeed` handles partial failure (one provider throws) and returns remaining meetings
- Microsoft Graph client correctly maps Graph API event shape to `UnifiedCalendarMeeting`
- `GET /api/calendar/status` returns correct connected/disconnected state per provider
- `POST /api/calendar/disconnect/:provider` clears only the target provider's tokens
- Integrations page renders all 7 integration cards
- `CalendarMeetingRow` renders correct badge for `microsoft_teams` and `microsoft_outlook` providers

### Property-Based Tests

Using **fast-check** (already available in the TypeScript/Next.js ecosystem).

Each property test runs a minimum of **100 iterations**.

Tag format: `Feature: calendar-integrations-unified, Property {N}: {property_text}`

**Property 1 test** — `Feature: calendar-integrations-unified, Property 1: Unified feed only includes meetings from connected providers`
Generate a random subset of providers as "connected", generate random meetings for all three providers, run the feed merge logic, assert all returned meetings have a provider in the connected subset.

**Property 2 test** — `Feature: calendar-integrations-unified, Property 2: Every meeting in the feed carries a provider field`
Generate arbitrary lists of `UnifiedCalendarMeeting` objects from the merge function, assert every item has a valid `provider` value.

**Property 3 test** — `Feature: calendar-integrations-unified, Property 3: Partial failure preserves available meetings`
Generate a scenario where one provider throws and others succeed, assert the response contains the successful meetings and a non-empty `partialFailure` array.

**Property 4 test** — `Feature: calendar-integrations-unified, Property 4: Disconnect removes provider meetings from feed`
Generate a random provider, simulate disconnect (remove tokens), call feed, assert no meetings with that provider appear.

**Property 5 test** — `Feature: calendar-integrations-unified, Property 5: OAuth connect round-trip stores valid tokens`
Generate random valid OAuth callback payloads for each provider, call the token persistence function, assert the stored row has a non-null `access_token` matching the provider.

**Property 6 test** — `Feature: calendar-integrations-unified, Property 6: Integration page displays all seven integrations`
Render the Integrations page component with arbitrary integration state, assert all 7 provider names appear in the output.

**Property 7 test** — `Feature: calendar-integrations-unified, Property 7: Feed respects the requested date range`
Generate random date ranges and random meetings (some inside, some outside the range), run the feed filter, assert all returned meetings fall within the range.
