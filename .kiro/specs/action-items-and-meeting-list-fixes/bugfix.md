# Bugfix Requirements Document

## Introduction

This document addresses multiple related issues in the meeting bot application affecting action items visibility, bulk operations, task generator save functionality, and meeting list behavior in Email/Task Generator pages. These bugs prevent users from effectively managing action items and accessing meeting data, impacting core workflow functionality.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a meeting is completed and action items are created with meetingId = null THEN the system fails to display those action items on the Action Items page because the GET endpoint filters by exact meetingId match only

1.2 WHEN a user clicks the CSV export button on the Action Items page THEN the system does nothing because the /api/action-items/export/csv endpoint does not exist

1.3 WHEN a user clicks the Slack posting button on the Action Items page THEN the system does nothing because the /api/action-items/export/slack endpoint does not exist

1.4 WHEN a user clicks a status badge to change an action item's status THEN the system does nothing because the /api/action-items/[id]/status PATCH endpoint does not exist

1.5 WHEN a user saves tasks from the Task Generator using the "Save All" button THEN the system posts to /api/action-items/bulk-save which does not exist, causing the save operation to fail

1.6 WHEN a user opens the Email Generator or Task Generator page THEN the system shows the same static meetings from initial mount without refreshing or updating the list

1.7 WHEN a user types in the meeting search box on Email/Task Generator pages THEN the system filters only the client-side cached meetings without fetching fresh results from the server

### Expected Behavior (Correct)

2.1 WHEN a meeting is completed and action items are created THEN the system SHALL display all action items on the Action Items page, including those with meetingId = null (for the current user's items) by updating the GET endpoint filter logic

2.2 WHEN a user clicks the CSV export button on the Action Items page THEN the system SHALL create and download a CSV file containing the selected action items by implementing the /api/action-items/export/csv endpoint

2.3 WHEN a user clicks the Slack posting button on the Action Items page THEN the system SHALL post the selected action items to the configured Slack channel by implementing the /api/action-items/export/slack endpoint

2.4 WHEN a user clicks a status badge to change an action item's status THEN the system SHALL update the status in the database and reflect the change in the UI by implementing the /api/action-items/[id]/status PATCH endpoint

2.5 WHEN a user saves tasks from the Task Generator using the "Save All" button THEN the system SHALL save all tasks to the action_items table with correct fields (userId, source: 'task-generator', status: 'pending', meetingId: null) by implementing the /api/action-items/bulk-save endpoint, and SHALL display a success message with a link to the Action Items page

2.6 WHEN a user opens the Email Generator or Task Generator page THEN the system SHALL fetch and display the last 10 COMPLETED meetings sorted by date DESC

2.7 WHEN a user types in the meeting search box on Email/Task Generator pages THEN the system SHALL dynamically filter meetings with 300ms debouncing by calling /api/meetings/reports with the search parameter

### Unchanged Behavior (Regression Prevention)

3.1 WHEN action items are created from meetings with a valid meetingId THEN the system SHALL CONTINUE TO display those action items correctly on the Action Items page

3.2 WHEN a user filters action items by tab (all, high_priority, my_items, this_week) THEN the system SHALL CONTINUE TO apply those filters correctly

3.3 WHEN a user filters action items by source (meeting, task-generator, document) THEN the system SHALL CONTINUE TO apply those filters correctly

3.4 WHEN a user exports action items to Jira THEN the system SHALL CONTINUE TO create Jira tickets successfully using the existing /api/action-items/export/jira endpoint

3.5 WHEN a user selects/deselects action items using checkboxes THEN the system SHALL CONTINUE TO track selection state correctly

3.6 WHEN the /api/meetings/reports endpoint receives requests with existing parameters (page, limit, status, date) THEN the system SHALL CONTINUE TO return filtered results correctly

3.7 WHEN a user generates tasks in the Task Generator THEN the system SHALL CONTINUE TO display generated tasks with correct priority, owner, and due date information

3.8 WHEN a user edits or deletes individual tasks in the Task Generator THEN the system SHALL CONTINUE TO update the task list correctly

3.9 WHEN a user copies tasks as text, markdown, or CSV from the Task Generator THEN the system SHALL CONTINUE TO format and copy the content correctly

3.10 WHEN the Action Items page loads THEN the system SHALL CONTINUE TO enforce subscription plan requirements (Pro or Elite) for accessing action items
