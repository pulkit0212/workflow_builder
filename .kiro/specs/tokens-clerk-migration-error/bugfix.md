# Bugfix Requirements Document

## Introduction

Two related authentication failures are preventing users from loading the Meetings page. First, every authenticated API request to the Express backend fails with `{"error": "Database migration required"}` because the `clerkAuth` middleware calls `syncUser()`, which queries the `users` table — if that table does not yet exist in the database (pg error code `42P01`), the error-handler intercepts it and returns a 503 with that message. Second, Clerk's own token-refresh endpoint (`tokens/expired`) returns `{"errors": [{"message": "Missing required parameter", "code": "missing_expired_token"}]}`, meaning the frontend is attempting to refresh a session without supplying the required expired-token parameter, likely because the session is already in a broken/uninitialized state caused by the first error. Together these failures leave the Meetings page stuck in a "Preparing..." state with no data.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user loads the Meetings page and the backend `users` table does not exist in the database THEN the system returns `{"error": "Database migration required"}` (HTTP 503) for every authenticated API call, including the initial `tokens/clerk` session-sync request

1.2 WHEN the backend returns a 503 "Database migration required" error on the first authenticated request THEN the system leaves the Clerk session in an inconsistent state, causing subsequent token-refresh calls to Clerk's `tokens/expired` endpoint to fail with `{"errors": [{"message": "Missing required parameter", "code": "missing_expired_token"}]}`

1.3 WHEN both errors occur simultaneously THEN the system displays the Meetings page in a perpetual "Preparing..." state with no meetings loaded and no actionable error message shown to the user

### Expected Behavior (Correct)

2.1 WHEN a user loads the Meetings page and the backend `users` table does not exist THEN the system SHALL surface a clear, actionable error (e.g., "Service temporarily unavailable — please contact support") rather than silently failing or leaving the UI in a loading state

2.2 WHEN the backend database migration has been applied and the `users` table exists THEN the system SHALL successfully complete the `syncUser()` call in `clerkAuth`, authenticate the request, and return a valid response to the frontend

2.3 WHEN the Clerk session is valid and the backend is healthy THEN the system SHALL successfully refresh tokens via Clerk's `tokens/expired` endpoint without a "Missing required parameter" error

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the backend database is fully migrated and the `users` table exists THEN the system SHALL CONTINUE TO authenticate requests via `clerkAuth` middleware and sync users on first login

3.2 WHEN a database connection error (not a missing-table error) occurs THEN the system SHALL CONTINUE TO return `{"error": "Service unavailable"}` (HTTP 503) as before

3.3 WHEN a user is already authenticated and the session is valid THEN the system SHALL CONTINUE TO load the Meetings page with today's and upcoming meetings

3.4 WHEN the `users` table exists but a different pg error occurs THEN the system SHALL CONTINUE TO propagate that error to the global error handler as before
