# Requirements Document

## Introduction

The app currently supports only Google Calendar for surfacing meetings on the Dashboard and Meetings page. Users who schedule meetings via Microsoft Teams or Outlook Calendar find those meetings missing from the app entirely. This feature extends the Integrations page to support three calendar providers — Google Calendar, Microsoft Teams (calendar), and Outlook Calendar — and ensures that meetings from any connected calendar appear on the Dashboard and Meetings page. Existing non-calendar integrations (Slack, Email, Notion, Jira) remain unchanged in behavior but must also be visible on the Integrations page.

## Glossary

- **Calendar_Integration**: A user-configured connection between the app and a calendar provider (Google Calendar, Microsoft Teams, or Outlook Calendar).
- **Integration_Page**: The `/dashboard/integrations` page where users manage all integrations.
- **Dashboard**: The `/dashboard` page showing today's meetings and recent reports.
- **Meetings_Page**: The `/dashboard/meetings` page listing all calendar meetings.
- **Calendar_Meeting**: A meeting event sourced from a connected calendar provider.
- **Provider**: The calendar service that is the source of a Calendar_Meeting (google, teams, or outlook).
- **Non_Calendar_Integration**: An integration that is not a calendar provider — Slack, Email, Notion, or Jira.
- **Connected_State**: The state of a Calendar_Integration when the user has successfully authorized and enabled it.
- **Disconnected_State**: The state of a Calendar_Integration when the user has disabled or revoked it.
- **Unified_Calendar_Feed**: The merged list of Calendar_Meetings from all Calendar_Integrations in Connected_State.

---

## Requirements

### Requirement 1: Display All Calendar Integrations on the Integrations Page

**User Story:** As a user, I want to see Google Calendar, Microsoft Teams, and Outlook Calendar as connectable options on the Integrations page, so that I can choose which calendar(s) to integrate with the app.

#### Acceptance Criteria

1. THE Integration_Page SHALL display a card for Google Calendar.
2. THE Integration_Page SHALL display a card for Microsoft Teams (calendar).
3. THE Integration_Page SHALL display a card for Outlook Calendar.
4. WHEN a Calendar_Integration card is displayed, THE Integration_Page SHALL show the provider name, a description, and a connect/disconnect control.
5. WHEN a Calendar_Integration is in Connected_State, THE Integration_Page SHALL display an "Active" indicator on that provider's card.
6. WHEN a Calendar_Integration is in Disconnected_State, THE Integration_Page SHALL display a connect action on that provider's card.

---

### Requirement 2: Display All Non-Calendar Integrations on the Integrations Page

**User Story:** As a user, I want to see Slack, Email, Notion, and Jira on the Integrations page alongside the calendar options, so that I can manage all my integrations in one place.

#### Acceptance Criteria

1. THE Integration_Page SHALL display a card for Slack.
2. THE Integration_Page SHALL display a card for Email.
3. THE Integration_Page SHALL display a card for Notion.
4. THE Integration_Page SHALL display a card for Jira.
5. WHEN a Non_Calendar_Integration card is displayed, THE Integration_Page SHALL preserve the existing configuration, toggle, and test-connection behavior for that integration.

---

### Requirement 3: Connect a Calendar Integration

**User Story:** As a user, I want to connect a calendar provider (Google, Teams, or Outlook), so that meetings from that calendar appear in the app.

#### Acceptance Criteria

1. WHEN a user initiates a connect action for a Calendar_Integration, THE Calendar_Integration SHALL begin an OAuth authorization flow for the selected provider.
2. WHEN the OAuth authorization flow completes successfully, THE Calendar_Integration SHALL transition to Connected_State.
3. WHEN the OAuth authorization flow fails or is cancelled, THE Calendar_Integration SHALL remain in Disconnected_State and THE Integration_Page SHALL display a descriptive error message.
4. THE Calendar_Integration SHALL store the authorization credentials securely and associate them with the authenticated user.

---

### Requirement 4: Show Calendar Meetings on the Dashboard

**User Story:** As a user, I want meetings from all my connected calendars to appear on the Dashboard, so that I have a complete view of today's schedule regardless of which calendar tool I used to create the meeting.

#### Acceptance Criteria

1. WHEN the Dashboard loads and at least one Calendar_Integration is in Connected_State, THE Dashboard SHALL fetch and display Calendar_Meetings from the Unified_Calendar_Feed for today's date.
2. WHEN a Calendar_Meeting is displayed on the Dashboard, THE Dashboard SHALL show the meeting title, time range, and provider badge (Google, Teams, or Outlook).
3. WHEN no Calendar_Integration is in Connected_State, THE Dashboard SHALL display a prompt to connect a calendar.
4. WHILE a Calendar_Integration is in Connected_State, THE Dashboard SHALL include Calendar_Meetings from that provider in the today's meetings section.

---

### Requirement 5: Show Calendar Meetings on the Meetings Page

**User Story:** As a user, I want meetings from all my connected calendars to appear on the Meetings page, so that I can start AI Notetaker or view details for any meeting regardless of its source.

#### Acceptance Criteria

1. WHEN the Meetings_Page loads and at least one Calendar_Integration is in Connected_State, THE Meetings_Page SHALL fetch and display Calendar_Meetings from the Unified_Calendar_Feed.
2. WHEN a Calendar_Meeting is displayed on the Meetings_Page, THE Meetings_Page SHALL show the meeting title, time range, and provider badge.
3. WHEN a Calendar_Meeting is displayed on the Meetings_Page, THE Meetings_Page SHALL allow the user to start AI Notetaker for that meeting.

---

### Requirement 6: Disconnect a Calendar Integration

**User Story:** As a user, I want to disconnect a calendar integration, so that meetings from that calendar no longer appear in the app.

#### Acceptance Criteria

1. WHEN a user disconnects a Calendar_Integration, THE Calendar_Integration SHALL transition to Disconnected_State.
2. WHEN a Calendar_Integration transitions to Disconnected_State, THE Dashboard SHALL no longer display Calendar_Meetings sourced from that provider.
3. WHEN a Calendar_Integration transitions to Disconnected_State, THE Meetings_Page SHALL no longer display Calendar_Meetings sourced from that provider.
4. WHEN a Calendar_Integration transitions to Disconnected_State, THE Calendar_Integration SHALL revoke or discard the stored authorization credentials for that provider.
5. IF a user disconnects all Calendar_Integrations, THEN THE Dashboard SHALL display a prompt to connect a calendar in place of the meetings list.

---

### Requirement 7: Unified Calendar Feed API

**User Story:** As a developer, I want a single API endpoint that returns meetings from all connected calendar providers, so that the Dashboard and Meetings page can consume one feed instead of provider-specific endpoints.

#### Acceptance Criteria

1. THE Unified_Calendar_Feed SHALL expose an API endpoint that accepts a date range parameter.
2. WHEN the endpoint is called, THE Unified_Calendar_Feed SHALL query each Calendar_Integration in Connected_State for the authenticated user and merge the results.
3. WHEN the endpoint is called, THE Unified_Calendar_Feed SHALL return each Calendar_Meeting with a `provider` field indicating its source (google, teams, or outlook).
4. WHEN a Calendar_Integration is in Disconnected_State, THE Unified_Calendar_Feed SHALL exclude Calendar_Meetings from that provider.
5. IF a provider API call fails, THEN THE Unified_Calendar_Feed SHALL return Calendar_Meetings from the remaining providers and include a partial-failure indicator in the response.
6. FOR ALL Calendar_Meetings returned by the endpoint, THE Unified_Calendar_Feed SHALL include at minimum: `id`, `title`, `startTime`, `endTime`, `meetLink`, and `provider` fields.
