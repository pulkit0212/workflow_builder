# Implementation Plan

## Phase 1: Exploration - Write Bug Condition Tests (BEFORE Fix)

- [x] 1. Write bug condition exploration tests
  - **Property 1: Bug Condition** - Missing Endpoints and Static Meeting Lists
  - **CRITICAL**: These tests MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  - **Scoped PBT Approach**: Test concrete failing cases for each bug condition
  - Test 1.1: Slack export endpoint - POST to /api/action-items/export/slack with valid itemIds, expect 404 error on unfixed code
  - Test 1.2: Bulk save endpoint - POST to /api/action-items/bulk-save with task array, expect 404 error on unfixed code
  - Test 1.3: Meeting search behavior - Type search term in Task Generator, verify only client-side filtering occurs (no server call) on unfixed code
  - Test 1.4: CSV export button - Verify button is wired to exportToCSV function (may pass - verify this is not actually a bug)
  - Test 1.5: Status update endpoint - Verify frontend calls /api/action-items/[id] not /api/action-items/[id]/status (may pass - verify this is not actually a bug)
  - Test 1.6: Null meetingId display - Create action items with meetingId=null, verify they display on Action Items page (may pass - verify this is not actually a bug)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests 1.1, 1.2, 1.3 FAIL (confirms bugs exist); Tests 1.4, 1.5, 1.6 may PASS (requirements may be incorrect)
  - Document counterexamples found to understand root cause
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.7_

## Phase 2: Preservation - Write Preservation Tests (BEFORE Fix)

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Functionality Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Test 2.1: Action items with valid meetingId display correctly with meeting links
  - Test 2.2: Tab filters (all, high_priority, my_items, this_week) apply correctly
  - Test 2.3: Source filters (meeting, task-generator, document) apply correctly
  - Test 2.4: Jira export continues to work via /api/action-items/export/jira
  - Test 2.5: Checkbox selection/deselection tracks state correctly
  - Test 2.6: /api/meetings/reports with existing parameters (page, limit, status, date) returns correct results
  - Test 2.7: Task Generator generate, edit, delete, copy functions work correctly
  - Test 2.8: Subscription plan enforcement (Pro or Elite) continues for action items access
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: All tests PASS (confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

## Phase 3: Implementation - Apply Fixes

- [x] 3. Implement missing Slack export endpoint

  - [x] 3.1 Create /api/action-items/export/slack endpoint
    - Create new file: src/app/api/action-items/export/slack/route.ts
    - Accept POST request with body: { itemIds: string[] }
    - Validate user authentication and authorization
    - Fetch action items by IDs and verify user ownership
    - Format items for Slack message using Slack Block Kit format
    - Post to Slack webhook URL (from environment variable SLACK_WEBHOOK_URL)
    - Return success response: { success: true } or error: { success: false, error: string }
    - Include error handling for network failures
    - _Bug_Condition: isBugCondition(input) where input.bugType == "missing_slack_export"_
    - _Expected_Behavior: Property 3 - Slack export works for selected action items_
    - _Preservation: Preservation Requirements 3.4 (Jira export continues to work)_
    - _Requirements: 1.3, 2.3_

  - [x] 3.2 Verify Slack export exploration test now passes
    - **Property 1: Expected Behavior** - Slack Export Works
    - **IMPORTANT**: Re-run the SAME test from task 1 (Test 1.1) - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run Slack export test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Jira Export Unchanged
    - **IMPORTANT**: Re-run the SAME test from task 2 (Test 2.4) - do NOT write a new test
    - Run Jira export preservation test from step 2
    - **EXPECTED OUTCOME**: Test PASSES (confirms no regressions)
    - Confirm Jira export still works after adding Slack export

- [x] 4. Implement missing bulk save endpoint

  - [x] 4.1 Create /api/action-items/bulk-save endpoint
    - Create new file: src/app/api/action-items/bulk-save/route.ts
    - Accept POST request with body: { source: string, items: Array<{ task, owner, dueDate, priority, completed }> }
    - Validate user authentication and subscription (Pro or Elite required)
    - Transform items to database format with userId, source, status='pending', meetingId=null
    - Bulk insert into action_items table using Drizzle ORM: db.insert(actionItems).values(itemsArray)
    - Set default values: status='pending', meetingId=null, meetingTitle=null
    - Validate all required fields are present
    - Return success response: { success: true, count: number } or error: { success: false, message: string }
    - _Bug_Condition: isBugCondition(input) where input.bugType == "missing_bulk_save"_
    - _Expected_Behavior: Property 5 - Task Generator bulk save works_
    - _Preservation: Preservation Requirements 3.7, 3.8, 3.9 (Task Generator functions continue to work)_
    - _Requirements: 1.5, 2.5_

  - [x] 4.2 Verify bulk save exploration test now passes
    - **Property 1: Expected Behavior** - Bulk Save Works
    - **IMPORTANT**: Re-run the SAME test from task 1 (Test 1.2) - do NOT write a new test
    - Run bulk save test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.5_

  - [x] 4.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Task Generator Functions Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 (Tests 2.7) - do NOT write new tests
    - Run Task Generator preservation tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm generate, edit, delete, copy functions still work after adding bulk save

- [x] 5. Implement dynamic meeting search with debouncing

  - [x] 5.1 Add server-side search to TaskGeneratorWorkspace
    - File: src/features/tools/task-generator/components/task-generator-workspace.tsx
    - Keep existing initial load useEffect (loads meetings on mount with empty search)
    - Add new useEffect that watches deferredSearchTerm (already using useDeferredValue for 300ms debouncing)
    - When deferredSearchTerm changes, call fetchMeetingReports with search parameter
    - Update meetings state with server results
    - Remove client-side filteredMeetings filtering - use server results directly
    - Show loading state while fetching
    - Replace all uses of filteredMeetings with meetings
    - _Bug_Condition: isBugCondition(input) where input.bugType == "static_meeting_list"_
    - _Expected_Behavior: Property 6 - Dynamic meeting search works with 300ms debouncing_
    - _Preservation: Preservation Requirements 3.6 (existing /api/meetings/reports parameters continue to work)_
    - _Requirements: 1.6, 1.7, 2.6, 2.7_

  - [x] 5.2 Add server-side search to EmailGeneratorWorkspace
    - File: src/features/tools/email-generator/components/email-generator-workspace.tsx
    - Apply identical changes as TaskGeneratorWorkspace
    - Keep existing initial load useEffect
    - Add new useEffect for deferredSearchTerm
    - Remove client-side filteredMeetings filtering
    - Use server results directly
    - _Bug_Condition: isBugCondition(input) where input.bugType == "static_meeting_list"_
    - _Expected_Behavior: Property 6 - Dynamic meeting search works with 300ms debouncing_
    - _Preservation: Preservation Requirements 3.6 (existing /api/meetings/reports parameters continue to work)_
    - _Requirements: 1.6, 1.7, 2.6, 2.7_

  - [x] 5.3 Verify meeting search exploration test now passes
    - **Property 1: Expected Behavior** - Dynamic Meeting Search Works
    - **IMPORTANT**: Re-run the SAME test from task 1 (Test 1.3) - do NOT write a new test
    - Run meeting search test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify server is called with search parameter after 300ms debouncing
    - _Requirements: 2.6, 2.7_

  - [x] 5.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Meeting List Parameters Unchanged
    - **IMPORTANT**: Re-run the SAME test from task 2 (Test 2.6) - do NOT write a new test
    - Run /api/meetings/reports preservation test from step 2
    - **EXPECTED OUTCOME**: Test PASSES (confirms no regressions)
    - Confirm existing parameters (page, limit, status, date) still work correctly

- [x] 6. Verify potential non-bugs (requirements validation)

  - [x] 6.1 Verify CSV export button wiring
    - File: src/app/dashboard/action-items/page.tsx
    - Verify "Download CSV" button onClick handler calls exportToCSV(selectedItems)
    - If already wired correctly, document that this is NOT a bug
    - If not wired, fix the onClick handler
    - Test CSV export with selected items
    - _Requirements: 1.2, 2.2_

  - [x] 6.2 Verify status update endpoint path
    - File: src/app/dashboard/action-items/page.tsx
    - Verify frontend calls /api/action-items/${id} not /api/action-items/${id}/status
    - If already correct, document that this is NOT a bug
    - If incorrect, fix the endpoint path
    - Test status update by clicking status badge
    - _Requirements: 1.4, 2.4_

  - [x] 6.3 Verify null meetingId display
    - File: src/app/api/action-items/route.ts and src/app/dashboard/action-items/page.tsx
    - Verify GET endpoint does NOT filter by meetingId (only by userId and optional filters)
    - Verify UI correctly handles null meetingId by showing "—" in Meeting column
    - If already working, document that this is NOT a bug
    - Test by creating action items with meetingId=null via Task Generator
    - _Requirements: 1.1, 2.1_

## Phase 4: Final Validation

- [x] 7. Checkpoint - Ensure all tests pass
  - Run all exploration tests from Phase 1 - all should now PASS
  - Run all preservation tests from Phase 2 - all should still PASS
  - Run full integration test: generate tasks → save all → verify on Action Items page
  - Run full integration test: select items → export to Slack → verify Slack message
  - Run full integration test: type search → wait → verify server called → verify results displayed
  - Verify subscription checks continue to work for all operations
  - Ask the user if questions arise or if any tests fail
