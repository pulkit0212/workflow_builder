# Requirements Document

## Introduction

This document specifies requirements for making the Settings page fully functional with PostgreSQL database integration. Currently, the Settings page uses localStorage for preferences and bot settings, which is incorrect. All settings must be persisted to the PostgreSQL database to ensure data consistency, multi-device synchronization, and proper data management.

The Settings page has 7 tabs: Profile, Account, Subscription, Preferences, Bot Settings, Integrations, and Usage & Limits. Each tab must read from and write to appropriate data sources (PostgreSQL database, Clerk API, or existing API routes).

## Glossary

- **Settings_Page**: The user interface at /dashboard/settings that allows users to configure their workspace
- **User_Preferences_Table**: PostgreSQL table storing user preference settings
- **Preferences_API**: REST API endpoints for managing user preferences (GET, POST)
- **Settings_API**: Collection of API routes for settings management
- **Bot_Settings**: Configuration for the AI Notetaker bot (display name, audio source)
- **Clerk**: Third-party authentication service managing user profiles and sessions
- **Profile_Tab**: Settings tab for managing user profile information
- **Account_Tab**: Settings tab for account security and data management
- **Subscription_Tab**: Settings tab for plan and billing management
- **Preferences_Tab**: Settings tab for email notifications and AI behavior preferences
- **Bot_Settings_Tab**: Settings tab for AI Notetaker bot configuration
- **Usage_Tab**: Settings tab for usage statistics and data management
- **Integrations_Tab**: Settings tab linking to integrations page
- **Toast_System**: UI notification system for user feedback
- **PostgreSQL**: Relational database system for persistent data storage
- **localStorage**: Browser-based storage (currently used incorrectly, must be replaced)

## Requirements

### Requirement 1: User Preferences Database Schema

**User Story:** As a developer, I want a user_preferences table in PostgreSQL, so that user settings persist across sessions and devices.

#### Acceptance Criteria

1. THE User_Preferences_Table SHALL have a unique userId field referencing the users table
2. THE User_Preferences_Table SHALL store emailNotifications as JSONB with fields: meetingSummary, actionItems, weeklyDigest, productUpdates
3. THE User_Preferences_Table SHALL store defaultEmailTone as VARCHAR with values: professional, friendly, formal, concise
4. THE User_Preferences_Table SHALL store summaryLength as VARCHAR with values: brief, standard, detailed
5. THE User_Preferences_Table SHALL store language as VARCHAR with values: en, hi
6. THE User_Preferences_Table SHALL store botDisplayName as VARCHAR with default value "Artiva Notetaker"
7. THE User_Preferences_Table SHALL store audioSource as VARCHAR with default value "default"
8. THE User_Preferences_Table SHALL have createdAt and updatedAt timestamp fields
9. WHEN the table is created, THE User_Preferences_Table SHALL be added to the Drizzle schema export in src/db/schema/index.ts

### Requirement 2: Preferences API Endpoints

**User Story:** As a user, I want my preferences to be saved to the database, so that my settings are available on all my devices.

#### Acceptance Criteria

1. THE Preferences_API SHALL provide a GET endpoint at /api/settings/preferences
2. WHEN a GET request is received, THE Preferences_API SHALL return the user's preferences from the database
3. IF no preferences exist for the user, THEN THE Preferences_API SHALL create default preferences and return them
4. THE Preferences_API SHALL provide a POST endpoint at /api/settings/preferences
5. WHEN a POST request is received with valid preference data, THE Preferences_API SHALL upsert the preferences to the database
6. WHEN preferences are successfully saved, THE Preferences_API SHALL return a success response with status 200
7. IF the user is not authenticated, THEN THE Preferences_API SHALL return status 401
8. IF the request data is invalid, THEN THE Preferences_API SHALL return status 400 with error details

### Requirement 3: Bot Settings API Endpoint

**User Story:** As a user, I want my bot settings to be saved to the database, so that my AI Notetaker configuration persists.

#### Acceptance Criteria

1. THE Settings_API SHALL provide a POST endpoint at /api/settings/bot
2. WHEN a POST request is received with botDisplayName and audioSource, THE Settings_API SHALL save these to the user_preferences table
3. WHEN bot settings are successfully saved, THE Settings_API SHALL return a success response with status 200
4. IF the user is not authenticated, THEN THE Settings_API SHALL return status 401
5. THE Settings_API SHALL validate that botDisplayName is not empty before saving

### Requirement 4: Usage Statistics API Endpoint

**User Story:** As a user, I want to see my usage statistics, so that I can monitor my Artivaa usage and limits.

#### Acceptance Criteria

1. THE Settings_API SHALL provide a GET endpoint at /api/settings/usage
2. WHEN a GET request is received, THE Settings_API SHALL return meetings count (this month and all time)
3. WHEN a GET request is received, THE Settings_API SHALL return action items count
4. WHEN a GET request is received, THE Settings_API SHALL return storage usage statistics
5. WHEN a GET request is received, THE Settings_API SHALL return plan limits from the subscription
6. WHEN a GET request is received, THE Settings_API SHALL return memberSince date
7. IF the user is not authenticated, THEN THE Settings_API SHALL return status 401

### Requirement 5: Account Deletion API Endpoint

**User Story:** As a user, I want to delete my account, so that I can remove all my data from the system.

#### Acceptance Criteria

1. THE Settings_API SHALL provide a DELETE endpoint at /api/settings/account
2. WHEN a DELETE request is received, THE Settings_API SHALL delete all user data from the database
3. WHEN a DELETE request is received, THE Settings_API SHALL delete the user from Clerk
4. WHEN account deletion is successful, THE Settings_API SHALL return status 200
5. IF the user is not authenticated, THEN THE Settings_API SHALL return status 401
6. THE Settings_API SHALL delete data in this order: action_items, meeting_sessions, user_preferences, integrations, subscriptions, users

### Requirement 6: Payment History API Endpoint

**User Story:** As a user, I want to see my payment history, so that I can track my subscription payments.

#### Acceptance Criteria

1. THE Settings_API SHALL provide a GET endpoint at /api/settings/payments
2. WHEN a GET request is received, THE Settings_API SHALL return payment records from subscription_payments table
3. WHEN a GET request is received, THE Settings_API SHALL return payments ordered by date descending
4. THE Settings_API SHALL return payment fields: id, date, plan, amount, currency, status, invoiceNumber
5. IF the user is not authenticated, THEN THE Settings_API SHALL return status 401
6. IF no payments exist, THEN THE Settings_API SHALL return an empty array

### Requirement 7: Profile Tab Database Integration

**User Story:** As a user, I want to edit my profile name, so that my display name is updated across the application.

#### Acceptance Criteria

1. WHEN the Profile_Tab loads, THE Settings_Page SHALL fetch user data from Clerk
2. THE Profile_Tab SHALL display firstName and lastName from Clerk user object
3. WHEN the user clicks Edit, THE Profile_Tab SHALL enable name editing
4. WHEN the user saves the name, THE Profile_Tab SHALL update Clerk user via user.update()
5. WHEN the name update succeeds, THE Profile_Tab SHALL display a success toast
6. IF the name update fails, THEN THE Profile_Tab SHALL display an error toast
7. THE Profile_Tab SHALL display email as read-only with a "Verified ✓" badge
8. THE Profile_Tab SHALL display memberSince date formatted as "DD MMM YYYY"

### Requirement 8: Account Tab Functionality

**User Story:** As a user, I want to manage my account security, so that I can control my sessions and account data.

#### Acceptance Criteria

1. THE Account_Tab SHALL display connected Google account with email address
2. THE Account_Tab SHALL provide a "Sign out of all other devices" button
3. WHEN the sign out button is clicked, THE Account_Tab SHALL call clerk.signOut() for all sessions except current
4. WHEN sign out succeeds, THE Account_Tab SHALL display a success toast
5. THE Account_Tab SHALL provide a "Delete Account" button in the Danger Zone
6. WHEN delete account is clicked, THE Account_Tab SHALL show a confirmation modal
7. WHEN the user types "DELETE" and confirms, THE Account_Tab SHALL call DELETE /api/settings/account
8. WHEN account deletion succeeds, THE Account_Tab SHALL redirect to "/"

### Requirement 9: Subscription Tab Enhancement

**User Story:** As a user, I want to see my subscription details and payment history, so that I can manage my billing.

#### Acceptance Criteria

1. WHEN the Subscription_Tab loads, THE Settings_Page SHALL fetch data from GET /api/subscription
2. THE Subscription_Tab SHALL display current plan with appropriate badge (Trial, Free, Pro, Elite)
3. IF the plan is trial, THEN THE Subscription_Tab SHALL display days remaining and expiration date
4. THE Subscription_Tab SHALL display meetings usage with progress bar
5. THE Subscription_Tab SHALL display action items count and documents analyzed count
6. IF the user can upgrade, THEN THE Subscription_Tab SHALL display upgrade cards for Pro (₹99) and Elite (₹199)
7. THE Subscription_Tab SHALL fetch payment history from GET /api/settings/payments
8. THE Subscription_Tab SHALL display payment history in a table with columns: Date, Plan, Amount, Status
9. IF no payments exist, THEN THE Subscription_Tab SHALL display "No payments yet"

### Requirement 10: Preferences Tab Database Integration

**User Story:** As a user, I want my preferences to save to the database, so that they persist across sessions.

#### Acceptance Criteria

1. WHEN the Preferences_Tab loads, THE Settings_Page SHALL fetch preferences from GET /api/settings/preferences
2. THE Preferences_Tab SHALL display 4 email notification toggles: meetingSummary, actionItems, weeklyDigest, productUpdates
3. THE Preferences_Tab SHALL display 4 email tone radio buttons: Professional, Friendly, Formal, Concise
4. THE Preferences_Tab SHALL display 3 summary length radio buttons: brief, standard, detailed
5. THE Preferences_Tab SHALL display a language dropdown with options: English, Hindi
6. WHEN the user clicks Save, THE Preferences_Tab SHALL POST preferences to /api/settings/preferences
7. WHEN save succeeds, THE Preferences_Tab SHALL display a success toast
8. IF save fails, THEN THE Preferences_Tab SHALL display an error toast
9. THE Preferences_Tab SHALL NOT use localStorage for any preference storage

### Requirement 11: Bot Settings Tab Database Integration

**User Story:** As a user, I want my bot settings to save to the database, so that my AI Notetaker configuration persists.

#### Acceptance Criteria

1. WHEN the Bot_Settings_Tab loads, THE Settings_Page SHALL fetch bot profile status from GET /api/bot/profile-status
2. THE Bot_Settings_Tab SHALL fetch bot settings from GET /api/settings/preferences
3. THE Bot_Settings_Tab SHALL display bot display name input field
4. THE Bot_Settings_Tab SHALL display audio source input field
5. THE Bot_Settings_Tab SHALL display platform support information cards
6. WHEN the user clicks Save, THE Bot_Settings_Tab SHALL POST bot settings to /api/settings/bot
7. WHEN save succeeds, THE Bot_Settings_Tab SHALL display a success toast
8. IF save fails, THEN THE Bot_Settings_Tab SHALL display an error toast
9. THE Bot_Settings_Tab SHALL NOT use localStorage for any bot settings storage

### Requirement 12: Usage Tab Real Data Integration

**User Story:** As a user, I want to see real usage statistics, so that I can monitor my Artivaa usage.

#### Acceptance Criteria

1. WHEN the Usage_Tab loads, THE Settings_Page SHALL fetch usage data from GET /api/settings/usage
2. THE Usage_Tab SHALL display 4 stat cards: Meetings Recorded, Transcripts Generated, Action Items Created, Documents Analyzed
3. THE Usage_Tab SHALL display meetings usage with progress bar colored by usage percentage
4. THE Usage_Tab SHALL display all-time statistics: total meetings, total action items, member since
5. THE Usage_Tab SHALL provide a "Download My Data" button (placeholder for future implementation)
6. THE Usage_Tab SHALL provide a "Delete All Meeting Data" button
7. WHEN delete data is clicked, THE Usage_Tab SHALL show a confirmation modal
8. WHEN the user types "DELETE" and confirms, THE Usage_Tab SHALL call DELETE /api/usage/data
9. WHEN data deletion succeeds, THE Usage_Tab SHALL refresh usage statistics

### Requirement 13: Toast Notification System

**User Story:** As a user, I want to see feedback notifications, so that I know when my actions succeed or fail.

#### Acceptance Criteria

1. THE Toast_System SHALL support 4 types: success, error, info, warning
2. THE Toast_System SHALL display toasts in the bottom-right corner
3. WHEN a toast is shown, THE Toast_System SHALL auto-dismiss after 3 seconds for success/info
4. WHEN an error toast is shown, THE Toast_System SHALL auto-dismiss after 5 seconds
5. THE Toast_System SHALL display success toasts with green styling
6. THE Toast_System SHALL display error toasts with red styling
7. THE Toast_System SHALL display info toasts with blue styling
8. WHEN a new toast is triggered, THE Toast_System SHALL clear any existing toast timer

### Requirement 14: Settings Page Data Loading

**User Story:** As a user, I want the settings page to load quickly, so that I can access my settings without delay.

#### Acceptance Criteria

1. WHEN the Settings_Page loads, THE Settings_Page SHALL fetch subscription, usage stats, and bot status in parallel
2. WHILE data is loading, THE Settings_Page SHALL display a loading indicator
3. WHEN data loading completes, THE Settings_Page SHALL hide the loading indicator
4. IF any API call fails, THEN THE Settings_Page SHALL display an error toast
5. THE Settings_Page SHALL continue to function even if some API calls fail
6. WHEN switching tabs, THE Settings_Page SHALL NOT refetch data unless explicitly refreshed

### Requirement 15: localStorage Removal

**User Story:** As a developer, I want to remove all localStorage usage from settings, so that data is properly persisted to the database.

#### Acceptance Criteria

1. THE Settings_Page SHALL NOT read preferences from localStorage
2. THE Settings_Page SHALL NOT write preferences to localStorage
3. THE Settings_Page SHALL NOT read bot settings from localStorage
4. THE Settings_Page SHALL NOT write bot settings to localStorage
5. THE Settings_Page SHALL remove all references to preferencesStorageKey
6. THE Settings_Page SHALL remove all references to botSettingsStorageKey
7. THE Settings_Page SHALL remove all localStorage.getItem() calls for settings
8. THE Settings_Page SHALL remove all localStorage.setItem() calls for settings

## Correctness Properties

### Property 1: Preferences Persistence (Round-Trip)

FOR ALL valid user preferences objects p:
- WHEN p is saved via POST /api/settings/preferences
- AND subsequently fetched via GET /api/settings/preferences
- THEN the fetched preferences SHALL equal p

This is a round-trip property ensuring data integrity through save and load operations.

### Property 2: User Preferences Uniqueness (Invariant)

FOR ALL users u:
- THE database SHALL contain at most one user_preferences record WHERE userId = u.id
- This invariant SHALL be maintained by the unique constraint on userId

### Property 3: Default Preferences Creation (Idempotence)

FOR ALL users u:
- WHEN GET /api/settings/preferences is called multiple times without intervening POST
- THEN all calls SHALL return the same preferences object
- AND only one database record SHALL be created

This ensures idempotent behavior for preference initialization.

### Property 4: Toast Auto-Dismiss Timing (Metamorphic)

FOR ALL toast notifications t:
- IF t.type = "success" OR t.type = "info", THEN dismissTime = 3000ms
- IF t.type = "error", THEN dismissTime = 5000ms
- AND dismissTime(error) > dismissTime(success)

### Property 5: Account Deletion Cascade (Invariant)

WHEN a user account is deleted:
- ALL action_items WHERE userId = deleted_user.id SHALL be deleted
- ALL meeting_sessions WHERE userId = deleted_user.id SHALL be deleted
- ALL user_preferences WHERE userId = deleted_user.id SHALL be deleted
- ALL integrations WHERE userId = deleted_user.id SHALL be deleted
- ALL subscriptions WHERE userId = deleted_user.userId SHALL be deleted
- THE user record SHALL be deleted last

This ensures referential integrity during cascading deletes.

### Property 6: API Authentication (Invariant)

FOR ALL Settings_API endpoints:
- IF the request does not include valid authentication
- THEN the endpoint SHALL return status 401
- AND no database operations SHALL be performed

### Property 7: Preferences Tab State Consistency (Invariant)

WHILE the Preferences_Tab is displayed:
- THE displayed preferences SHALL match the most recent successful GET response
- AFTER a successful POST, the displayed preferences SHALL match the posted data
- NO localStorage data SHALL influence the displayed preferences

### Property 8: Usage Statistics Non-Negative (Invariant)

FOR ALL usage statistics returned by GET /api/settings/usage:
- meetingsThisMonth >= 0
- meetingsAllTime >= 0
- actionItemsCreated >= 0
- documentsAnalyzed >= 0
- transcriptsGenerated >= 0
- AND meetingsThisMonth <= meetingsAllTime

### Property 9: Payment History Ordering (Invariant)

FOR ALL payment records returned by GET /api/settings/payments:
- THE records SHALL be ordered by date in descending order
- FOR ALL adjacent records (r1, r2): r1.date >= r2.date

### Property 10: Bot Settings Validation (Error Condition)

WHEN POST /api/settings/bot is called:
- IF botDisplayName is empty or null
- THEN the API SHALL return status 400
- AND no database update SHALL occur

### Property 11: Subscription Tab Data Consistency (Metamorphic)

FOR ALL subscription data displayed:
- IF plan = "trial", THEN trialDaysLeft SHALL be displayed
- IF plan = "free", THEN upgrade cards SHALL be displayed
- IF plan = "pro", THEN only Elite upgrade card SHALL be displayed
- IF plan = "elite", THEN no upgrade cards SHALL be displayed

### Property 12: Preferences Upsert Behavior (Idempotence)

FOR ALL preference objects p:
- WHEN p is POSTed to /api/settings/preferences twice
- THEN the second POST SHALL update the existing record
- AND only one user_preferences record SHALL exist for the user
- AND the final state SHALL equal p

This ensures upsert (insert or update) behavior is idempotent.
