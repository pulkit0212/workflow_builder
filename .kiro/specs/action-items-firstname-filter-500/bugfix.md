# Bugfix Requirements Document

## Introduction

The `GET /api/action-items` endpoint returns a 500 error when the `firstName` query parameter is provided alongside `tab=all`. The frontend always sends `firstName` (the current user's first name) as a query param on every request, but the API only applies the `firstName` filter when `tab=my_items`. For all other tab values, the parameter is silently ignored — and under certain conditions the request crashes with a 500 instead of returning filtered or unfiltered results. This bug prevents users from loading their action items list when a `firstName` value is present in the request.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a GET request is made to `/api/action-items` with `tab=all` and a non-empty `firstName` query parameter THEN the system returns a 500 Internal Server Error instead of a list of action items.

1.2 WHEN a GET request is made to `/api/action-items` with `tab=high_priority`, `tab=this_week`, or `tab=all` and a non-empty `firstName` query parameter THEN the system ignores the `firstName` filter entirely and does not apply it to the query results.

1.3 WHEN the `firstName` filter is intended to scope results to items owned by the named user THEN the system only applies this filter for `tab=my_items`, leaving all other tabs unfiltered by owner name.

### Expected Behavior (Correct)

2.1 WHEN a GET request is made to `/api/action-items` with `tab=all` and a non-empty `firstName` query parameter THEN the system SHALL return a 200 response with action items filtered by owner name matching `firstName`.

2.2 WHEN a GET request is made to `/api/action-items` with any `tab` value and a non-empty `firstName` query parameter THEN the system SHALL apply the `firstName` filter as an additional `ilike` condition on the `owner` field, independent of the tab filter.

2.3 WHEN a GET request is made to `/api/action-items` with a non-empty `firstName` query parameter THEN the system SHALL NOT crash or return a 500 error regardless of the `tab` value.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a GET request is made to `/api/action-items` with `tab=my_items` and a non-empty `firstName` THEN the system SHALL CONTINUE TO apply the `ilike` owner filter as it currently does.

3.2 WHEN a GET request is made to `/api/action-items` with no `firstName` parameter (or an empty string) THEN the system SHALL CONTINUE TO return action items without any owner name filter applied.

3.3 WHEN a GET request is made to `/api/action-items` with `tab=high_priority` and no `firstName` THEN the system SHALL CONTINUE TO filter results to only high priority items.

3.4 WHEN a GET request is made to `/api/action-items` with `tab=this_week` and no `firstName` THEN the system SHALL CONTINUE TO filter results to items created within the last 7 days.

3.5 WHEN a GET request is made to `/api/action-items` with a `source` filter THEN the system SHALL CONTINUE TO apply the source filter correctly alongside any other active filters.

3.6 WHEN a GET request is made to `/api/action-items` with workspace context THEN the system SHALL CONTINUE TO enforce workspace isolation and role-based visibility.
