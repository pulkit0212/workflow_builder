# Implementation Plan: Settings Page Database Integration

## Overview

This implementation plan converts the Settings page from localStorage-based persistence to PostgreSQL database-backed storage. The implementation follows a sequential approach: database schema → API endpoints → frontend refactoring → localStorage removal → testing.

All tasks build incrementally, with each step validating functionality before proceeding. The plan includes both required implementation tasks and optional testing tasks for comprehensive quality assurance.

## Tasks

- [x] 1. Create database schema and migration
  - Create `src/db/schema/user-preferences.ts` with userPreferences table definition
  - Add fields: id, userId (FK to users), emailNotifications (JSONB), defaultEmailTone, summaryLength, language, botDisplayName, audioSource, createdAt, updatedAt
  - Add unique constraint on userId and cascade delete on user deletion
  - Export userPreferences table in `src/db/schema/index.ts`
  - Generate and run Drizzle migration
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 1.1 Write property test for user preferences uniqueness
  - **Property 2: User Preferences Uniqueness Invariant**
  - **Validates: Requirements 1.1**
  - Test that database enforces at most one user_preferences record per userId

- [x] 2. Implement GET /api/settings/preferences endpoint
  - [x] 2.1 Create `src/app/api/settings/preferences/route.ts` with GET handler
    - Authenticate user via Clerk
    - Query user_preferences table by userId
    - If no preferences exist, create default preferences (idempotent)
    - Return preferences JSON with success response
    - Handle errors with appropriate status codes (401, 500)
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

  - [x] 2.2 Write property test for default preferences creation idempotence
    - **Property 3: Default Preferences Creation Idempotence**
    - **Validates: Requirements 2.3**
    - Implemented in `src/tests/api/settings/preferences.property.test.ts` (describe "Property 3: Default Preferences Creation Idempotence")

  - [x] 2.3 Write unit tests for GET /api/settings/preferences
    - Test successful preferences retrieval
    - Test default preferences creation for new users
    - Test 401 response for unauthenticated requests
    - Test error handling for database failures (500 when select throws)
    - _Requirements: 2.1, 2.2, 2.3, 2.7_
    - Implemented in `src/tests/api/settings/preferences.test.ts`

- [x] 3. Implement POST /api/settings/preferences endpoint
  - [x] 3.1 Add POST handler to `src/app/api/settings/preferences/route.ts`
    - Authenticate user via Clerk
    - Validate request body with Zod schema (emailNotifications, defaultEmailTone, summaryLength, language)
    - Upsert preferences to database (insert if not exists, update if exists)
    - Return updated preferences with success response
    - Handle validation errors (400) and auth errors (401)
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 3.2 Write property test for preferences persistence round-trip
    - **Property 1: Preferences Persistence Round-Trip**
    - **Validates: Requirements 2.2, 2.5**
    - Implemented in `src/tests/api/settings/preferences.test.ts` (describe "Property 1: Preferences persistence round-trip"; fast-check sampled POST response)

  - [x] 3.3 Write property test for preferences upsert behavior
    - **Property 4: Preferences Upsert Behavior**
    - **Validates: Requirements 2.5**
    - Implemented in `src/tests/api/settings/preferences.test.ts` (describe "Property 4: upsert uses update when row exists")

  - [x] 3.4 Write unit tests for POST /api/settings/preferences
    - Test successful preferences save
    - Test partial update (only some fields provided)
    - Test validation errors for invalid data
    - Test 401 response for unauthenticated requests
    - Test 500 when update throws
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 2.8_
    - Implemented in `src/tests/api/settings/preferences.test.ts`

- [x] 4. Checkpoint - Verify preferences API endpoints
  - Test GET and POST endpoints manually with Postman or curl
  - Verify database records are created and updated correctly
  - Ensure all tests pass, ask the user if questions arise

- [x] 5. Implement POST /api/settings/bot endpoint
  - [x] 5.1 Create `src/app/api/settings/bot/route.ts` with POST handler
    - Authenticate user via Clerk
    - Validate request body with Zod schema (botDisplayName required, audioSource optional)
    - Update botDisplayName and audioSource in user_preferences table
    - Return success response
    - Handle validation errors (400) and auth errors (401)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 5.2 Write property test for bot settings validation
    - **Property 6: Bot Settings Validation**
    - **Validates: Requirements 3.5**
    - Test that empty botDisplayName returns 400 and no database update occurs

  - [x] 5.3 Write unit tests for POST /api/settings/bot
    - Test successful bot settings save
    - Test validation error for empty botDisplayName
    - Test 401 response for unauthenticated requests
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 6. Implement GET /api/settings/usage endpoint
  - [x] 6.1 Create `src/app/api/settings/usage/route.ts` with GET handler
    - Authenticate user via Clerk
    - Query meeting_sessions for meetings this month and all time
    - Query meeting_sessions for transcripts generated count
    - Query action_items for action items created count
    - Query uploaded_files for documents analyzed count
    - Fetch subscription limits from subscription service
    - Return aggregated usage statistics with limits
    - Handle errors with appropriate status codes (401, 500)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.2 Write property test for usage statistics non-negative invariant
    - **Property 7: Usage Statistics Non-Negative Invariant**
    - **Validates: Requirements 4.2, 4.3, 4.4**
    - Test that all usage counts are non-negative and meetingsThisMonth <= meetingsAllTime

  - [x] 6.3 Write unit tests for GET /api/settings/usage
    - Test successful usage statistics retrieval
    - Test correct aggregation of counts
    - Test 401 response for unauthenticated requests
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 7. Implement DELETE /api/settings/account endpoint
  - [x] 7.1 Create `src/app/api/settings/account/route.ts` with DELETE handler
    - Authenticate user via Clerk
    - Delete data in correct order: action_items, meeting_sessions, user_preferences, user_integrations, subscriptions, users
    - Delete user from Clerk after database cleanup
    - Return success response
    - Handle errors with appropriate status codes (401, 500)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.2 Write property test for account deletion cascade invariant
    - **Property 9: Account Deletion Cascade Invariant**
    - **Validates: Requirements 5.2, 5.3, 5.6**
    - Test that all user data is deleted in correct order and user is removed from Clerk

  - [x] 7.3 Write unit tests for DELETE /api/settings/account
    - Test successful account deletion
    - Test deletion order is correct
    - Test 401 response for unauthenticated requests
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 8. Implement GET /api/settings/payments endpoint
  - [x] 8.1 Create `src/app/api/settings/payments/route.ts` with GET handler
    - Authenticate user via Clerk
    - Query subscription_payments table by userId
    - Order payments by date descending
    - Return payment records with fields: id, date, plan, amount, currency, status, invoiceNumber
    - Handle errors with appropriate status codes (401, 500)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 8.2 Write property test for payment history ordering and structure
    - **Property 8: Payment History Ordering and Structure**
    - **Validates: Requirements 6.3, 6.4**
    - Test that payments are ordered by date descending and contain all required fields

  - [x] 8.3 Write unit tests for GET /api/settings/payments
    - Test successful payment history retrieval
    - Test correct ordering by date descending
    - Test empty array for users with no payments
    - Test 401 response for unauthenticated requests
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. Checkpoint - Verify all API endpoints
  - Test all 6 API endpoints manually
  - Verify error handling and authentication
  - Ensure all tests pass, ask the user if questions arise

- [x] 10. Write property test for API authentication invariant
  - **Property 5: API Authentication Invariant**
  - **Validates: Requirements 2.7, 3.4, 4.7, 5.5, 6.5**
  - Test that all API endpoints return 401 for unauthenticated requests and perform no database operations

- [x] 11. Refactor Settings Page to load data from API
  - [x] 11.1 Update `src/app/dashboard/settings/page.tsx` data loading
    - Remove localStorage read operations for preferences and bot settings
    - Add useEffect to fetch data from API endpoints on mount
    - Fetch preferences, usage stats, payments, subscription, and bot status in parallel
    - Update state with fetched data
    - Display loading indicator while fetching
    - Show error toast if any API call fails
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 11.2 Write integration test for Settings Page data loading
    - Test parallel API fetching on mount
    - Test loading indicator display
    - Test error toast on API failure
    - Test page remains functional if some API calls fail
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

- [x] 12. Refactor Profile Tab
  - [x] 12.1 Update Profile Tab to use Clerk user data
    - Display firstName and lastName from Clerk user object
    - Enable name editing with inline edit mode
    - Save name changes via Clerk user.update() method
    - Display success toast on successful update
    - Display error toast on update failure
    - Display email as read-only with "Verified ✓" badge
    - Display memberSince date formatted as "DD MMM YYYY"
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 12.2 Write unit tests for Profile Tab
    - Test name editing and save functionality
    - Test success and error toast display
    - Test read-only email display
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 13. Refactor Account Tab
  - [x] 13.1 Update Account Tab functionality
    - Display connected Google account with email
    - Implement "Sign out of all other devices" button with clerk.signOut() for other sessions
    - Display success toast on successful sign out
    - Implement "Delete Account" button with confirmation modal
    - Require user to type "DELETE" to confirm account deletion
    - Call DELETE /api/settings/account on confirmation
    - Redirect to "/" on successful deletion
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 13.2 Write unit tests for Account Tab
    - Test sign out other sessions functionality
    - Test delete account confirmation flow
    - Test redirect after successful deletion
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 14. Refactor Subscription Tab
  - [x] 14.1 Update Subscription Tab to display subscription data
    - Fetch subscription data from GET /api/subscription
    - Display current plan with appropriate badge (Trial, Free, Pro, Elite)
    - Display trial days remaining and expiration date if plan is trial
    - Display meetings usage with progress bar
    - Display action items count and documents analyzed count
    - Display upgrade cards for Pro (₹99) and Elite (₹199) if user can upgrade
    - Fetch payment history from GET /api/settings/payments
    - Display payment history table with columns: Date, Plan, Amount, Status
    - Display "No payments yet" if no payments exist
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 14.2 Write unit tests for Subscription Tab
    - Test subscription data display
    - Test payment history display
    - Test upgrade cards visibility based on plan
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

- [x] 15. Refactor Preferences Tab to save to database
  - [x] 15.1 Update Preferences Tab to use API
    - Fetch preferences from GET /api/settings/preferences on tab load
    - Display 4 email notification toggles: meetingSummary, actionItems, weeklyDigest, productUpdates
    - Display 4 email tone radio buttons: Professional, Friendly, Formal, Concise
    - Display 3 summary length radio buttons: brief, standard, detailed
    - Display language dropdown with options: English, Hindi
    - Save preferences via POST /api/settings/preferences on Save button click
    - Display success toast on successful save
    - Display error toast on save failure
    - Remove all localStorage operations for preferences
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x] 15.2 Write property test for Preferences Tab state consistency
    - **Property 12: Preferences Tab State Consistency**
    - **Validates: Requirements 10.6, 10.7, 10.9**
    - Test that displayed preferences match most recent GET response and no localStorage influences state

  - [x] 15.3 Write unit tests for Preferences Tab
    - Test preferences loading from API
    - Test preferences saving to API
    - Test success and error toast display
    - Test no localStorage usage
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9_

- [x] 16. Refactor Bot Settings Tab to save to database
  - [x] 16.1 Update Bot Settings Tab to use API
    - Fetch bot profile status from GET /api/bot/profile-status
    - Fetch bot settings from GET /api/settings/preferences
    - Display bot display name input field
    - Display audio source input field
    - Display platform support information cards
    - Save bot settings via POST /api/settings/bot on Save button click
    - Display success toast on successful save
    - Display error toast on save failure
    - Remove all localStorage operations for bot settings
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

  - [x] 16.2 Write property test for Bot Settings Tab state consistency
    - **Property 13: Bot Settings Tab State Consistency**
    - **Validates: Requirements 11.6, 11.7, 11.9**
    - Test that displayed bot settings match most recent GET response and no localStorage influences state

  - [x] 16.3 Write unit tests for Bot Settings Tab
    - Test bot settings loading from API
    - Test bot settings saving to API
    - Test success and error toast display
    - Test no localStorage usage
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

- [x] 17. Refactor Usage Tab to display real data
  - [x] 17.1 Update Usage Tab to use API
    - Fetch usage data from GET /api/settings/usage on tab load
    - Display 4 stat cards: Meetings Recorded, Transcripts Generated, Action Items Created, Documents Analyzed
    - Display meetings usage with progress bar colored by usage percentage
    - Display all-time statistics: total meetings, total action items, member since
    - Implement "Download My Data" button (placeholder for future)
    - Implement "Delete All Meeting Data" button with confirmation modal
    - Require user to type "DELETE" to confirm data deletion
    - Call DELETE /api/usage/data on confirmation
    - Refresh usage statistics after successful deletion
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

  - [x] 17.2 Write unit tests for Usage Tab
    - Test usage statistics display
    - Test delete data confirmation flow
    - Test statistics refresh after deletion
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

- [x] 18. Checkpoint - Verify all tabs functionality
  - Manual verification in browser (developer); automated coverage via tab/unit tests where applicable

- [x] 19. Remove all localStorage references from Settings Page
  - [x] 19.1 Clean up localStorage code
    - Remove preferencesStorageKey constant
    - Remove botSettingsStorageKey constant
    - Remove all localStorage.getItem() calls for settings
    - Remove all localStorage.setItem() calls for settings
    - Remove all localStorage.removeItem() calls for settings
    - Verify no localStorage usage remains in settings functionality
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x] 19.2 Write property test for localStorage elimination
    - **Property 14: localStorage Elimination**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
    - Test that no localStorage operations occur during settings operations

- [x] 20. Implement toast notification system enhancements
  - [x] 20.1 Enhance toast system
    - Support 4 toast types: success, error, info, warning
    - Display toasts in bottom-right corner
    - Auto-dismiss success/info toasts after 3 seconds
    - Auto-dismiss error toasts after 5 seconds
    - Style success toasts with green
    - Style error toasts with red
    - Style info toasts with blue
    - Clear existing toast timer when new toast is triggered
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

  - [x] 20.2 Write property test for toast auto-dismiss timing
    - **Property 10: Toast Auto-Dismiss Timing**
    - **Validates: Requirements 13.3, 13.4**
    - Covered by timing assertions in `src/tests/components/toast.test.ts` (auto-dismiss duration helpers)

  - [x] 20.3 Write property test for toast timer replacement
    - **Property 11: Toast Timer Replacement**
    - **Validates: Requirements 13.8**
    - Covered by timer management tests in `src/tests/components/toast.test.ts`

  - [x] 20.4 Write unit tests for toast system
    - Test toast display for each type
    - Test auto-dismiss timing
    - Test timer clearing on new toast
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_
    - Implemented in `src/tests/components/toast.test.ts`

- [x] 21. Add input validation utilities
  - [x] 21.1 Create validation schemas
    - Create `src/lib/validation/preferences.ts` with Zod schemas
    - Define emailNotificationsSchema
    - Define emailToneSchema with enum values
    - Define summaryLengthSchema with enum values
    - Define languageSchema with enum values
    - Define preferencesSchema for API validation
    - Define botSettingsSchema for API validation
    - Export TypeScript types from schemas
    - _Requirements: 2.8, 3.5_

  - [x] 21.2 Write unit tests for validation schemas
    - Test valid inputs pass validation
    - Test invalid inputs fail validation
    - Test error messages are descriptive
    - _Requirements: 2.8, 3.5_
    - Implemented in `src/tests/lib/validation/preferences.test.ts`

- [x] 22. Final checkpoint - End-to-end verification
  - Test complete user flow: load settings → modify preferences → save → reload page → verify persistence
  - Test account deletion flow completely
  - Test error handling for network failures
  - Verify no localStorage usage in browser DevTools
  - Run all unit tests and property tests
  - Ensure all tests pass, ask the user if questions arise

- [x] 23. Write property test for Settings Page resilience
  - **Property 15: Settings Page Resilience**
  - **Validates: Requirements 14.4, 14.5**
  - Covered by `src/tests/settings/page.integration.test.tsx` (describe "Page resilience when some API calls fail" and related error/loading cases)

- [x] 24. Write integration tests for complete Settings Page
  - Test tab switching functionality
  - Test data persistence across tab switches
  - Test error recovery and retry mechanisms
  - Test concurrent save operations
  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  - Implemented in `src/tests/settings/page.integration.test.tsx` (parallel fetch, loading, errors, tab-switch no-refetch; concurrent save not separately automated)

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties across all inputs
- Unit tests validate specific examples, edge cases, and error conditions
- Implementation follows dependency order: database → API → frontend → cleanup
- All API endpoints require authentication and return consistent error responses
- Frontend refactoring removes localStorage completely and uses database-backed state
- Toast system provides consistent user feedback across all operations
