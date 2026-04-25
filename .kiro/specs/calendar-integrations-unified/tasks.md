# Implementation Plan: Calendar Integrations Unified

## Overview

Extend the app to support Google Calendar, Microsoft Teams, and Outlook Calendar as unified calendar providers. Introduces a new `/api/meetings/calendar-feed` endpoint, new OAuth routes for Microsoft providers, a `frontend/src/lib/calendar/` module, and updates the Integrations page to show calendar connections alongside existing productivity tool integrations.

## Tasks

- [x] 1. Define shared calendar types and interfaces
  - Create `frontend/src/lib/calendar/types.ts` with `CalendarProvider`, `UnifiedCalendarMeeting`, `CalendarFeedResponse`, and `CalendarClient` interface
  - These types will be imported by all subsequent calendar modules
  - _Requirements: 7.3, 7.6_

- [ ] 2. Implement Google Calendar client adapter
  - [x] 2.1 Create `frontend/src/lib/calendar/google.ts` implementing `CalendarClient`
    - Wrap the existing `fetchGoogleCalendarMeetingsForDay` logic to return `UnifiedCalendarMeeting[]` with `provider: "google"`
    - Map existing `GoogleCalendarMeeting` fields to `UnifiedCalendarMeeting` shape
    - _Requirements: 4.1, 4.2, 7.2, 7.3_

  - [ ]* 2.2 Write property test for Google client provider field
    - **Property 2: Every meeting in the feed carries a provider field**
    - **Validates: Requirements 4.2, 7.3, 7.6**

- [ ] 3. Implement Microsoft Graph calendar client
  - [x] 3.1 Create `frontend/src/lib/calendar/microsoft.ts` implementing `CalendarClient`
    - Fetch events from `GET https://graph.microsoft.com/v1.0/me/calendarView` with `startDateTime`/`endDateTime` query params
    - Select fields: `id,subject,start,end,onlineMeeting,webLink`
    - Map Graph API event shape to `UnifiedCalendarMeeting` with correct `provider` value (`"microsoft_teams"` or `"microsoft_outlook"`)
    - Implement token refresh: check expiry, refresh if within 60 seconds, update `user_integrations` row
    - Handle 401 by attempting refresh; if refresh fails, throw a typed error so the feed can mark the provider as disconnected
    - _Requirements: 4.1, 4.2, 5.1, 5.2, 7.2, 7.3_

  - [ ]* 3.2 Write property test for Microsoft client provider field
    - **Property 2: Every meeting in the feed carries a provider field**
    - **Validates: Requirements 4.2, 5.2, 7.3, 7.6**

- [ ] 4. Implement unified calendar feed logic
  - [x] 4.1 Create `frontend/src/lib/calendar/feed.ts` with `fetchUnifiedCalendarFeed(userId, startDate, endDate)`
    - Query `user_integrations` for all calendar provider rows belonging to the user
    - Fan out to each connected provider's client in parallel using `Promise.allSettled`
    - Merge results, sort by `startTime` ascending
    - On partial failure, collect failing providers into `partialFailure` array and return available meetings
    - Return `CalendarFeedResponse`
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [ ]* 4.2 Write property test for unified feed — only connected providers
    - **Property 1: Unified feed only includes meetings from connected providers**
    - **Validates: Requirements 4.4, 6.2, 6.3, 7.4**

  - [ ]* 4.3 Write property test for partial failure preservation
    - **Property 3: Partial failure preserves available meetings**
    - **Validates: Requirements 7.5**

  - [ ]* 4.4 Write property test for date range filtering
    - **Property 7: Feed respects the requested date range**
    - **Validates: Requirements 7.1, 7.2**

- [ ] 5. Create the Unified Calendar Feed API route
  - [x] 5.1 Create `frontend/src/app/api/meetings/calendar-feed/route.ts`
    - `GET` handler accepting `startDate` and `endDate` query params (ISO 8601); return 400 if missing or invalid
    - Authenticate user via Clerk, call `fetchUnifiedCalendarFeed`, return `CalendarFeedResponse` as JSON
    - Return HTTP 200 even on partial failure (include `partialFailure` in body)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement Microsoft OAuth routes
  - [x] 7.1 Create `frontend/src/app/api/calendar/connect/[provider]/route.ts`
    - `GET` handler: build Azure AD OAuth authorization URL with `Calendars.Read offline_access` scopes
    - Store a CSRF state token in a short-lived cookie
    - Redirect to the authorization URL
    - Support `provider` values: `"google"`, `"microsoft_teams"`, `"microsoft_outlook"`
    - _Requirements: 3.1_

  - [x] 7.2 Create `frontend/src/app/api/calendar/callback/[provider]/route.ts`
    - `GET` handler: validate state cookie, exchange code for tokens via Azure AD token endpoint
    - Upsert `user_integrations` row with `access_token`, `refresh_token`, `expiry`, and `provider`
    - On success, redirect to `/dashboard/integrations`
    - On failure (invalid state, token exchange error), redirect to `/dashboard/integrations?error=oauth_failed`
    - _Requirements: 3.2, 3.3, 3.4_

  - [ ]* 7.3 Write property test for OAuth token storage
    - **Property 5: OAuth connect round-trip stores valid tokens**
    - **Validates: Requirements 3.2, 3.4**

  - [x] 7.4 Create `frontend/src/app/api/calendar/disconnect/[provider]/route.ts`
    - `POST` handler: clear `access_token`, `refresh_token`, `expiry` for the given provider row in `user_integrations` (or delete the row)
    - No-op if no row exists; always return success
    - _Requirements: 6.1, 6.4_

  - [ ]* 7.5 Write property test for disconnect removes provider from feed
    - **Property 4: Disconnect removes provider meetings from feed**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [x] 7.6 Create `frontend/src/app/api/calendar/status/route.ts`
    - `GET` handler: query `user_integrations` for all three calendar providers for the authenticated user
    - Return `{ google: boolean, microsoft_teams: boolean, microsoft_outlook: boolean }` based on presence of non-expired (or refreshable) tokens
    - _Requirements: 1.5, 1.6_

- [ ] 8. Update the Integrations page
  - [x] 8.1 Add Calendar Connections section to `frontend/src/app/dashboard/integrations/page.tsx`
    - Fetch connected state from `GET /api/calendar/status` on mount
    - Render three calendar provider cards (Google Calendar, Microsoft Teams, Outlook Calendar) above the existing Productivity Tools section
    - Each card shows: provider name, description, icon, "Active" badge when connected, and Connect/Disconnect button
    - Connect button navigates to `/api/calendar/connect/:provider`; Disconnect calls `POST /api/calendar/disconnect/:provider` then refreshes status
    - Handle `?error=oauth_cancelled` and `?error=oauth_failed` query params on mount and show a descriptive toast
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 8.2 Write property test for Integrations page renders all seven cards
    - **Property 6: Integration page displays all seven integrations**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4**

- [x] 9. Update CalendarMeetingRow to handle new providers
  - Modify `frontend/src/features/meetings/components/calendar-meeting-row.tsx`
  - Update `getPlatformBadge` (or equivalent) to handle `provider` values `"microsoft_teams"` and `"microsoft_outlook"` from `UnifiedCalendarMeeting`
  - Render correct badge label and color for Teams (purple) and Outlook (blue) alongside existing Google Meet badge
  - _Requirements: 4.2, 5.2_

- [ ] 10. Migrate Dashboard and Meetings page to unified feed
  - [x] 10.1 Add `fetchUnifiedCalendarFeed` client function to `frontend/src/features/meetings/api.ts`
    - Call `GET /api/meetings/calendar-feed?startDate=<ISO>&endDate=<ISO>`
    - Return `CalendarFeedResponse`; surface `partialFailure` to callers
    - _Requirements: 4.1, 5.1_

  - [x] 10.2 Update `frontend/src/app/dashboard/page.tsx` to use the unified feed
    - Replace `fetchTodayMeetings()` call with the new unified feed function for today's date range
    - Show provider badge (Google, Teams, Outlook) on each meeting row using `UnifiedCalendarMeeting.provider`
    - When no calendar is connected, show prompt to connect a calendar linking to `/dashboard/integrations`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.2, 6.5_

  - [x] 10.3 Update the Meetings page to use the unified feed
    - Replace the existing calendar fetch with the unified feed endpoint
    - Pass `UnifiedCalendarMeeting` objects to `CalendarMeetingRow`; ensure the `provider` field flows through
    - _Requirements: 5.1, 5.2, 5.3, 6.3_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Microsoft Teams and Outlook Calendar share the same Azure AD OAuth app; the `provider` label stored in `user_integrations` differentiates them
- Property tests use **fast-check** with a minimum of 100 iterations per property
- The existing `user_integrations` table requires no schema migration — new providers are new rows with new `provider` values
