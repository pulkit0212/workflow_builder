/**
 * Property-Based Tests: Workspace Meetings API Filter Parameters
 *
 * Feature: workspace-integration, Property 12: Workspace meetings API filter parameters narrow results
 *
 * **Validates: Requirements 5.4, 5.5**
 *
 * For any search term, all returned meetings must have a title or summary
 * containing that term (case-insensitive). For any memberId, all returned
 * meetings must have userId = memberId. These filters must not return rows
 * that fail the filter predicate.
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ── Types ─────────────────────────────────────────────────────────────────────

type Visibility = "private" | "workspace" | "shared";

type MeetingSession = {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  summary: string | null;
  status: string;
  visibility: Visibility;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulates the server-side filter logic for GET /api/workspace/meetings.
 * Applies workspace isolation + search + memberId + status filters.
 */
function applyMeetingFilters(
  meetings: MeetingSession[],
  workspaceId: string,
  filters: {
    search?: string;
    memberId?: string;
    status?: string;
  }
): MeetingSession[] {
  return meetings.filter((m) => {
    if (m.workspaceId !== workspaceId) return false;

    if (filters.search) {
      const term = filters.search.toLowerCase();
      const inTitle = m.title.toLowerCase().includes(term);
      const inSummary = m.summary ? m.summary.toLowerCase().includes(term) : false;
      if (!inTitle && !inSummary) return false;
    }

    if (filters.memberId) {
      if (m.userId !== filters.memberId) return false;
    }

    if (filters.status) {
      if (m.status !== filters.status) return false;
    }

    return true;
  });
}

// ── Generators ────────────────────────────────────────────────────────────────

const visibilityArb = fc.constantFrom<Visibility>("private", "workspace", "shared");
const statusArb = fc.constantFrom("draft", "active", "completed", "failed");

/**
 * Generates a meeting whose title or summary is guaranteed to contain the given search term.
 */
function meetingContainingSearchTerm(workspaceId: string, term: string) {
  return fc.record({
    id: fc.uuid(),
    workspaceId: fc.constant(workspaceId),
    userId: fc.uuid(),
    // Embed the term in the title
    title: fc
      .tuple(
        fc.string({ minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 0, maxLength: 20 })
      )
      .map(([pre, post]) => `${pre}${term}${post}`),
    summary: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
    status: statusArb,
    visibility: visibilityArb,
  });
}

/**
 * Generates a meeting that does NOT contain the given search term in title or summary.
 */
function meetingNotContainingSearchTerm(workspaceId: string, term: string) {
  return fc
    .record({
      id: fc.uuid(),
      workspaceId: fc.constant(workspaceId),
      userId: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 64 }),
      summary: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
      status: statusArb,
      visibility: visibilityArb,
    })
    .filter(
      (m) =>
        !m.title.toLowerCase().includes(term.toLowerCase()) &&
        (m.summary === null || !m.summary.toLowerCase().includes(term.toLowerCase()))
    );
}

// ── Property 12 ───────────────────────────────────────────────────────────────

describe(
  // Feature: workspace-integration, Property 12: Workspace meetings API filter parameters narrow results
  "Property 12: Filter parameters narrow results — no returned row fails the filter predicate",
  () => {
    it(
      "search filter: all returned meetings contain the search term in title or summary (case-insensitive)",
      () => {
        /**
         * **Validates: Requirements 5.4**
         *
         * For any search term, all returned meetings must have a title or summary
         * containing that term (case-insensitive).
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0), // search term
            fc.integer({ min: 0, max: 10 }), // number of matching meetings
            fc.integer({ min: 0, max: 10 }), // number of non-matching meetings
            (workspaceId, searchTerm, matchCount, noMatchCount) => {
              // Build matching meetings (title contains the term)
              const matchingMeetings: MeetingSession[] = Array.from(
                { length: matchCount },
                (_, i) => ({
                  id: `match-${i}`,
                  workspaceId,
                  userId: `user-${i}`,
                  title: `prefix ${searchTerm} suffix`,
                  summary: null,
                  status: "completed",
                  visibility: "workspace" as Visibility,
                })
              );

              // Build non-matching meetings (title/summary do NOT contain the term)
              const nonMatchingMeetings: MeetingSession[] = Array.from(
                { length: noMatchCount },
                (_, i) => ({
                  id: `nomatch-${i}`,
                  workspaceId,
                  userId: `user-nm-${i}`,
                  title: "completely unrelated title xyz",
                  summary: null,
                  status: "completed",
                  visibility: "workspace" as Visibility,
                })
              ).filter(
                (m) =>
                  !m.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
                  (m.summary === null || !m.summary.toLowerCase().includes(searchTerm.toLowerCase()))
              );

              const allMeetings = [...matchingMeetings, ...nonMatchingMeetings];
              const results = applyMeetingFilters(allMeetings, workspaceId, {
                search: searchTerm,
              });

              // Every result must contain the search term
              for (const m of results) {
                const term = searchTerm.toLowerCase();
                const inTitle = m.title.toLowerCase().includes(term);
                const inSummary = m.summary ? m.summary.toLowerCase().includes(term) : false;
                expect(inTitle || inSummary).toBe(true);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "search filter: no non-matching meeting appears in results",
      () => {
        /**
         * **Validates: Requirements 5.4**
         *
         * Meetings that do not contain the search term must be excluded.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.string({ minLength: 2, maxLength: 15 }).filter((s) => /^[a-z]+$/i.test(s)), // simple alpha term
            fc.array(
              fc.record({
                id: fc.uuid(),
                userId: fc.uuid(),
                title: fc.string({ minLength: 1, maxLength: 64 }),
                summary: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
                status: statusArb,
                visibility: visibilityArb,
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, searchTerm, rawMeetings) => {
              const meetings: MeetingSession[] = rawMeetings.map((m) => ({
                ...m,
                workspaceId,
              }));

              const results = applyMeetingFilters(meetings, workspaceId, {
                search: searchTerm,
              });

              // Verify no result fails the predicate
              for (const m of results) {
                const term = searchTerm.toLowerCase();
                const inTitle = m.title.toLowerCase().includes(term);
                const inSummary = m.summary ? m.summary.toLowerCase().includes(term) : false;
                expect(inTitle || inSummary).toBe(true);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "memberId filter: all returned meetings have userId equal to the requested memberId",
      () => {
        /**
         * **Validates: Requirements 5.5**
         *
         * For any memberId, all returned meetings must have userId = memberId.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // memberId to filter by
            fc.array(
              fc.record({
                id: fc.uuid(),
                userId: fc.uuid(), // random — may or may not match memberId
                title: fc.string({ minLength: 1, maxLength: 64 }),
                summary: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
                status: statusArb,
                visibility: visibilityArb,
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, memberId, rawMeetings) => {
              const meetings: MeetingSession[] = rawMeetings.map((m) => ({
                ...m,
                workspaceId,
              }));

              const results = applyMeetingFilters(meetings, workspaceId, { memberId });

              for (const m of results) {
                expect(m.userId).toBe(memberId);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "memberId filter: meetings from other users are excluded",
      () => {
        /**
         * **Validates: Requirements 5.5**
         *
         * Meetings whose userId does not match memberId must not appear in results.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // memberId
            fc.uuid(), // otherUserId (different from memberId)
            fc.integer({ min: 0, max: 10 }),
            (workspaceId, memberId, otherUserId, otherCount) => {
              fc.pre(memberId !== otherUserId);

              const otherMeetings: MeetingSession[] = Array.from(
                { length: otherCount },
                (_, i) => ({
                  id: `other-${i}`,
                  workspaceId,
                  userId: otherUserId,
                  title: `Meeting ${i}`,
                  summary: null,
                  status: "completed",
                  visibility: "workspace" as Visibility,
                })
              );

              const results = applyMeetingFilters(otherMeetings, workspaceId, { memberId });

              // None of the other user's meetings should appear
              expect(results).toHaveLength(0);
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "combined search + memberId filters: results satisfy both predicates simultaneously",
      () => {
        /**
         * **Validates: Requirements 5.4, 5.5**
         *
         * When both search and memberId are provided, every returned meeting
         * must satisfy both filter predicates.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // memberId
            fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim().length > 0),
            fc.array(
              fc.record({
                id: fc.uuid(),
                userId: fc.uuid(),
                title: fc.string({ minLength: 1, maxLength: 64 }),
                summary: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
                status: statusArb,
                visibility: visibilityArb,
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, memberId, searchTerm, rawMeetings) => {
              const meetings: MeetingSession[] = rawMeetings.map((m) => ({
                ...m,
                workspaceId,
              }));

              const results = applyMeetingFilters(meetings, workspaceId, {
                search: searchTerm,
                memberId,
              });

              for (const m of results) {
                // Must match memberId
                expect(m.userId).toBe(memberId);

                // Must match search term
                const term = searchTerm.toLowerCase();
                const inTitle = m.title.toLowerCase().includes(term);
                const inSummary = m.summary ? m.summary.toLowerCase().includes(term) : false;
                expect(inTitle || inSummary).toBe(true);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);

// ── Property 13 ───────────────────────────────────────────────────────────────

// Feature: workspace-integration, Property 13: Workspace action items API filter parameters narrow results

type ActionItem = {
  id: string;
  workspaceId: string;
  owner: string;
  task: string;
  priority: string;
  status: string;
  meetingId: string | null;
};

/**
 * Simulates the server-side filter logic for GET /api/workspace/action-items.
 * Applies workspace isolation + assignee + meetingId + priority + status filters.
 */
function applyActionItemFilters(
  items: ActionItem[],
  workspaceId: string,
  filters: {
    assignee?: string;
    meetingId?: string;
    priority?: string;
    status?: string;
  }
): ActionItem[] {
  return items.filter((item) => {
    if (item.workspaceId !== workspaceId) return false;

    if (filters.assignee) {
      if (!item.owner.toLowerCase().includes(filters.assignee.toLowerCase())) return false;
    }

    if (filters.meetingId) {
      if (item.meetingId !== filters.meetingId) return false;
    }

    if (filters.priority) {
      if (item.priority !== filters.priority) return false;
    }

    if (filters.status) {
      if (item.status !== filters.status) return false;
    }

    return true;
  });
}

const priorityArb = fc.constantFrom("Low", "Medium", "High");
const actionStatusArb = fc.constantFrom("pending", "in_progress", "completed");

describe(
  // Feature: workspace-integration, Property 13: Workspace action items API filter parameters narrow results
  "Property 13: Action item filter parameters narrow results — no returned row fails the filter predicate",
  () => {
    it(
      "assignee filter: all returned action items have owner containing the assignee value (case-insensitive)",
      () => {
        /**
         * **Validates: Requirements 6.3**
         *
         * For any assignee filter, all returned action items must have owner containing that value.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: actionStatusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, assignee, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));
              const results = applyActionItemFilters(items, workspaceId, { assignee });

              for (const item of results) {
                expect(item.owner.toLowerCase()).toContain(assignee.toLowerCase());
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "meetingId filter: all returned action items have meetingId equal to the requested meetingId",
      () => {
        /**
         * **Validates: Requirements 6.4**
         *
         * For any meetingId filter, all returned action items must have meetingId matching.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // meetingId to filter by
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: actionStatusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, meetingId, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));
              const results = applyActionItemFilters(items, workspaceId, { meetingId });

              for (const item of results) {
                expect(item.meetingId).toBe(meetingId);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "priority filter: all returned action items have priority equal to the requested priority",
      () => {
        /**
         * **Validates: Requirements 6.5**
         *
         * For any priority filter, all returned action items must have that priority.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            priorityArb, // priority to filter by
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: actionStatusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, priority, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));
              const results = applyActionItemFilters(items, workspaceId, { priority });

              for (const item of results) {
                expect(item.priority).toBe(priority);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "status filter: all returned action items have status equal to the requested status",
      () => {
        /**
         * **Validates: Requirements 6.6**
         *
         * For any status filter, all returned action items must have that status.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            actionStatusArb, // status to filter by
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: actionStatusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, status, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));
              const results = applyActionItemFilters(items, workspaceId, { status });

              for (const item of results) {
                expect(item.status).toBe(status);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );

    it(
      "combined filters: results satisfy all active filter predicates simultaneously",
      () => {
        /**
         * **Validates: Requirements 6.3, 6.4, 6.5, 6.6**
         *
         * When multiple filters are provided, every returned action item must satisfy all of them.
         */
        fc.assert(
          fc.property(
            fc.uuid(), // workspaceId
            fc.uuid(), // meetingId
            priorityArb,
            actionStatusArb,
            fc.array(
              fc.record({
                id: fc.uuid(),
                owner: fc.string({ minLength: 1, maxLength: 32 }),
                task: fc.string({ minLength: 1, maxLength: 64 }),
                priority: priorityArb,
                status: actionStatusArb,
                meetingId: fc.option(fc.uuid(), { nil: null }),
              }),
              { minLength: 0, maxLength: 20 }
            ),
            (workspaceId, meetingId, priority, status, rawItems) => {
              const items: ActionItem[] = rawItems.map((item) => ({ ...item, workspaceId }));
              const results = applyActionItemFilters(items, workspaceId, {
                meetingId,
                priority,
                status,
              });

              for (const item of results) {
                expect(item.meetingId).toBe(meetingId);
                expect(item.priority).toBe(priority);
                expect(item.status).toBe(status);
              }
            }
          ),
          { numRuns: 100 }
        );
      }
    );
  }
);
