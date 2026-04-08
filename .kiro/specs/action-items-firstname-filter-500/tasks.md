# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - firstName Filter Ignored / 500 for Non-my_items Tabs
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases: `tab=all` + non-empty `firstName`, `tab=high_priority` + non-empty `firstName`, `tab=this_week` + non-empty `firstName`
  - Test that `GET /api/action-items?tab=all&firstName=Alice` returns 200 with owner-filtered items (from Bug Condition in design)
  - Test that `GET /api/action-items?tab=high_priority&firstName=Bob` returns items filtered by BOTH priority AND owner ilike `%bob%`
  - Test that `GET /api/action-items?tab=this_week&firstName=Carol` returns items filtered by BOTH date AND owner ilike `%carol%`
  - Test that `GET /api/action-items?tab=all&firstName=ZZZNoMatch` returns 200 with empty items array (not a 500)
  - The test assertions should match the Expected Behavior Properties from design: status 200, all returned items have `owner` matching `ilike('%firstName%')`
  - Run test on UNFIXED code — `tab=all` cases will return 500; other tab cases will return items not filtered by owner
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., `GET ?tab=all&firstName=Alice` returns 500 instead of 200 with filtered items)
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Bug Requests Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: `GET ?tab=my_items&firstName=Alice` on unfixed code applies ilike owner filter correctly
  - Observe: `GET ?tab=all` with no `firstName` on unfixed code returns all items without owner filter
  - Observe: `GET ?tab=high_priority` with no `firstName` on unfixed code returns only high-priority items
  - Observe: `GET ?tab=this_week` with no `firstName` on unfixed code returns only items from last 7 days
  - Observe: `GET ?source=meeting` on unfixed code returns only meeting-sourced items
  - Write property-based tests: for all requests where `isBugCondition` returns false (empty/absent `firstName` OR `tab=my_items`), the handler produces the same response as the original (from Preservation Requirements in design)
  - Cover: no `firstName` across all tab values; `tab=my_items` with `firstName`; source filter combinations; whitespace-only `firstName` (trimmed to empty)
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix firstName filter gated on tab=my_items

  - [x] 3.1 Implement the fix in `frontend/src/app/api/action-items/route.ts`
    - Remove `firstName` from the `else if (tab === "my_items" && firstName)` condition
    - The `my_items` branch becomes a no-op (ownership is already handled by `ownershipCondition`) and can be removed
    - After the tab-switching block, add an independent check: `if (firstName) { conditions.push(ilike(actionItems.owner, \`%${firstName}%\`)); }`
    - This ensures the `ilike` owner filter applies for ALL tab values whenever `firstName` is non-empty
    - _Bug_Condition: isBugCondition(request) where firstName != "" AND tab NOT IN ["my_items"]_
    - _Expected_Behavior: response.status == 200 AND all items in response have owner ilike '%firstName%'_
    - _Preservation: requests where isBugCondition is false must produce identical responses before and after the fix_
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - firstName Filter Applied for All Tabs
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — `tab=all&firstName=Alice` returns 200 with filtered items, etc.)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Bug Requests Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in tab filters, source filter, workspace isolation, and my_items behavior)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
