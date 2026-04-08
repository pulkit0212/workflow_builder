# Action Items firstName Filter 500 Bugfix Design

## Overview

The `GET /api/action-items` endpoint crashes with a 500 error when `firstName` is provided alongside `tab=all` (or any tab other than `my_items`). The root cause is that the `ilike` owner filter is gated inside an `else if (tab === "my_items" && firstName)` branch, so it is never applied for other tab values. The fix is to move the `firstName` filter outside the tab-switching block so it applies as an independent condition regardless of the active tab.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a non-empty `firstName` query parameter is present AND `tab` is any value other than `my_items`
- **Property (P)**: The desired behavior when the bug condition holds — the endpoint returns a 200 response with action items filtered by `ilike(actionItems.owner, '%firstName%')`
- **Preservation**: All existing filtering behavior (tab filters, source filter, workspace isolation) that must remain unchanged by the fix
- **GET handler**: The `GET` function in `frontend/src/app/api/action-items/route.ts` that handles action item list requests
- **ownershipCondition**: The Drizzle ORM condition that enforces workspace/personal visibility scope, built before the tab-filter block
- **conditions**: The array of Drizzle ORM conditions combined with `and(...)` to form the final `WHERE` clause

## Bug Details

### Bug Condition

The bug manifests when a request arrives with a non-empty `firstName` query parameter and a `tab` value that is not `my_items`. The `GET` handler only applies the `ilike` owner filter inside the `else if (tab === "my_items" && firstName)` branch. For `tab=all`, `tab=high_priority`, and `tab=this_week`, the `firstName` value is parsed but never used, and under certain database/ORM conditions this leads to a 500 error.

**Formal Specification:**
```
FUNCTION isBugCondition(request)
  INPUT: request with query params { tab, firstName }
  OUTPUT: boolean

  firstName := trim(lowercase(request.searchParams.get("firstName") ?? ""))
  tab       := request.searchParams.get("tab") ?? "all"

  RETURN firstName != ""
         AND tab NOT IN ["my_items"]
END FUNCTION
```

### Examples

- `GET /api/action-items?tab=all&firstName=Alice` → currently returns 500; expected: 200 with items where owner ilike `%alice%`
- `GET /api/action-items?tab=high_priority&firstName=Bob` → currently ignores `firstName` and returns all high-priority items; expected: high-priority items where owner ilike `%bob%`
- `GET /api/action-items?tab=this_week&firstName=Carol` → currently ignores `firstName`; expected: this-week items where owner ilike `%carol%`
- `GET /api/action-items?tab=my_items&firstName=Alice` → currently works correctly; must continue to work after fix

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- `tab=my_items` with a non-empty `firstName` must continue to apply the `ilike` owner filter exactly as before
- Requests with no `firstName` (or empty string) must continue to return results without any owner name filter
- `tab=high_priority` must continue to filter by `priority = 'High'`
- `tab=this_week` must continue to filter by `createdAt >= 7 days ago`
- The `source` filter must continue to apply correctly alongside all other filters
- Workspace isolation and role-based visibility logic must remain completely untouched

**Scope:**
All requests that do NOT have a non-empty `firstName` parameter should be completely unaffected by this fix. The only behavioral change is that `firstName`, when present, now applies its `ilike` condition for all tab values instead of only `my_items`.

## Hypothesized Root Cause

Based on reading the route handler, the cause is clear:

1. **firstName filter gated on tab value**: The `ilike` condition is inside `else if (tab === "my_items" && firstName)`, making it unreachable for any other tab. This is the primary defect.

2. **500 on tab=all**: When `tab=all` none of the `if/else if` branches match, so only `ownershipCondition` ends up in `conditions`. Drizzle's `and(...conditions)` with a single-element array may produce a query that the database rejects under certain schema/ORM versions, causing the 500.

3. **Silent ignore for other tabs**: For `tab=high_priority` and `tab=this_week`, the tab branch does match and adds its own condition, but `firstName` is still never added — so results are not owner-filtered.

## Correctness Properties

Property 1: Bug Condition - firstName Filter Applied for All Tabs

_For any_ request where `isBugCondition` returns true (non-empty `firstName` AND `tab != "my_items"`), the fixed `GET` handler SHALL return a 200 response whose `items` array contains only action items where the `owner` field matches the `firstName` value case-insensitively (ilike `%firstName%`), and SHALL NOT return a 500 error.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-Bug Requests Unchanged

_For any_ request where `isBugCondition` returns false (empty/absent `firstName`, OR `tab=my_items`), the fixed `GET` handler SHALL produce exactly the same response as the original handler, preserving all existing tab filters, source filters, and workspace isolation behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**File**: `frontend/src/app/api/action-items/route.ts`

**Function**: `GET`

**Specific Changes**:

1. **Move firstName filter outside the tab block**: Remove `firstName` from the `else if (tab === "my_items" && firstName)` condition so the tab block only handles tab-specific logic.

2. **Add independent firstName condition**: After the tab-switching block, add a standalone check:
   ```typescript
   if (firstName) {
     conditions.push(ilike(actionItems.owner, `%${firstName}%`));
   }
   ```

3. **Simplify my_items branch**: The `tab === "my_items"` branch currently does nothing except rely on the `firstName` condition that was bundled with it. After extracting `firstName`, the `my_items` branch can be left as a no-op (it applies no additional filter beyond ownership, which is already handled by `ownershipCondition`) or removed entirely.

**Before (lines ~100-108 in route.ts):**
```typescript
if (tab === "high_priority") {
  conditions.push(eq(actionItems.priority, "High"));
} else if (tab === "my_items" && firstName) {
  conditions.push(ilike(actionItems.owner, `%${firstName}%`));
} else if (tab === "this_week") {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  conditions.push(gte(actionItems.createdAt, sevenDaysAgo));
}
```

**After:**
```typescript
if (tab === "high_priority") {
  conditions.push(eq(actionItems.priority, "High"));
} else if (tab === "this_week") {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  conditions.push(gte(actionItems.createdAt, sevenDaysAgo));
}

// Apply firstName filter independently of tab
if (firstName) {
  conditions.push(ilike(actionItems.owner, `%${firstName}%`));
}
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write unit tests that call the `GET` handler (or a unit-testable extraction of the conditions-building logic) with `tab=all` and a non-empty `firstName`, and assert the response is 200 with filtered results. Run on UNFIXED code to observe the 500 or missing filter.

**Test Cases**:
1. **tab=all + firstName**: `GET /api/action-items?tab=all&firstName=Alice` — expect 200 with owner-filtered items (will fail/500 on unfixed code)
2. **tab=high_priority + firstName**: `GET /api/action-items?tab=high_priority&firstName=Bob` — expect items filtered by both priority AND owner (will return unfiltered-by-owner results on unfixed code)
3. **tab=this_week + firstName**: `GET /api/action-items?tab=this_week&firstName=Carol` — expect items filtered by both date AND owner (will return unfiltered-by-owner results on unfixed code)
4. **tab=all + firstName with no matching items**: `GET /api/action-items?tab=all&firstName=ZZZNoMatch` — expect 200 with empty items array (may 500 on unfixed code)

**Expected Counterexamples**:
- `tab=all` requests with `firstName` return 500 instead of 200
- `tab=high_priority` / `tab=this_week` requests with `firstName` return items not filtered by owner name
- Possible causes: `firstName` filter gated on `tab === "my_items"`, `and()` called with single condition causing ORM error

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed handler produces the expected behavior.

**Pseudocode:**
```
FOR ALL request WHERE isBugCondition(request) DO
  response := GET_fixed(request)
  ASSERT response.status == 200
  ASSERT ALL item IN response.items: item.owner ilike firstName
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed handler produces the same result as the original handler.

**Pseudocode:**
```
FOR ALL request WHERE NOT isBugCondition(request) DO
  ASSERT GET_original(request) == GET_fixed(request)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many tab/source/firstName combinations automatically
- It catches edge cases (empty firstName, whitespace-only firstName, various tab values) that manual tests miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code for requests without `firstName` or with `tab=my_items`, then write property-based tests capturing that behavior.

**Test Cases**:
1. **No firstName preservation**: Requests with no `firstName` (all tabs) return same results before and after fix
2. **tab=my_items + firstName preservation**: `tab=my_items` with `firstName` continues to apply ilike filter
3. **tab=high_priority no firstName preservation**: High-priority filter still works without `firstName`
4. **tab=this_week no firstName preservation**: This-week filter still works without `firstName`
5. **Source filter preservation**: `source=meeting`, `source=task-generator`, `source=document` filters still apply correctly

### Unit Tests

- Test `tab=all` + non-empty `firstName` returns 200 with owner-filtered results
- Test `tab=high_priority` + `firstName` returns items filtered by BOTH priority and owner
- Test `tab=this_week` + `firstName` returns items filtered by BOTH date and owner
- Test `tab=my_items` + `firstName` still works (regression check)
- Test empty `firstName` string applies no owner filter for any tab
- Test `firstName` with only whitespace (trimmed to empty) applies no owner filter

### Property-Based Tests

- Generate random `tab` values from `["all", "high_priority", "my_items", "this_week"]` with random non-empty `firstName` strings and assert response is always 200 with owner-filtered items
- Generate random `tab` values with empty/absent `firstName` and assert behavior matches original (no owner filter applied)
- Generate random `source` values alongside random `tab` + `firstName` combinations and assert source filter is always applied correctly

### Integration Tests

- Full request to `/api/action-items?tab=all&firstName=Alice` with seeded database returns 200 and only Alice's items
- Full request with `tab=high_priority&firstName=Bob` returns only Bob's high-priority items
- Full request with `tab=all` and no `firstName` returns all items (no regression)
- Workspace-scoped request with `firstName` still enforces workspace isolation
