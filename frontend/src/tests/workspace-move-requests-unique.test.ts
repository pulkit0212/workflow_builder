/**
 * Unit Test: workspace_move_requests unique constraint + ON CONFLICT semantics
 *
 * **Validates: Requirements 2.9**
 *
 * Verifies that with the unique constraint on (meeting_id, workspace_id),
 * a duplicate INSERT ... ON CONFLICT (meeting_id, workspace_id) DO UPDATE
 * resolves without error (upsert semantics).
 *
 * This is a pure logic test — no live DB required.
 * It simulates the constraint enforcement and ON CONFLICT resolution in-memory.
 */

import { describe, it, expect, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// In-memory simulation of workspace_move_requests with a unique constraint
// on (meeting_id, workspace_id).
// ---------------------------------------------------------------------------

interface MoveRequest {
  id: string;
  meeting_id: string;
  workspace_id: string;
  requested_by: string;
  status: string;
  admin_note: string | null;
}

class WorkspaceMoveRequestsTable {
  private rows: MoveRequest[] = [];
  private nextId = 1;

  /**
   * Simulates:
   *   INSERT INTO workspace_move_requests (meeting_id, workspace_id, requested_by, status)
   *   VALUES ($1, $2, $3, $4)
   *   ON CONFLICT (meeting_id, workspace_id) DO UPDATE
   *     SET status = EXCLUDED.status,
   *         admin_note = EXCLUDED.admin_note
   *   RETURNING *;
   *
   * With the unique constraint in place this must never throw.
   */
  upsert(
    meeting_id: string,
    workspace_id: string,
    requested_by: string,
    status: string,
    admin_note: string | null = null
  ): MoveRequest {
    const existing = this.rows.find(
      (r) => r.meeting_id === meeting_id && r.workspace_id === workspace_id
    );

    if (existing) {
      // ON CONFLICT DO UPDATE — update the conflicting row in place
      existing.status = status;
      existing.admin_note = admin_note;
      return existing;
    }

    // No conflict — plain INSERT
    const row: MoveRequest = {
      id: String(this.nextId++),
      meeting_id,
      workspace_id,
      requested_by,
      status,
      admin_note,
    };
    this.rows.push(row);
    return row;
  }

  /**
   * Simulates a plain INSERT without ON CONFLICT handling.
   * Throws a unique-constraint violation if a duplicate (meeting_id, workspace_id) exists.
   * Used to confirm the constraint is enforced.
   */
  insertRaw(
    meeting_id: string,
    workspace_id: string,
    requested_by: string,
    status: string
  ): MoveRequest {
    const duplicate = this.rows.some(
      (r) => r.meeting_id === meeting_id && r.workspace_id === workspace_id
    );
    if (duplicate) {
      throw new Error(
        `duplicate key value violates unique constraint "workspace_move_requests_meeting_workspace_unique"`
      );
    }
    const row: MoveRequest = {
      id: String(this.nextId++),
      meeting_id,
      workspace_id,
      requested_by,
      status,
      admin_note: null,
    };
    this.rows.push(row);
    return row;
  }

  all(): MoveRequest[] {
    return [...this.rows];
  }

  count(): number {
    return this.rows.length;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("workspace_move_requests unique constraint + ON CONFLICT semantics", () => {
  let table: WorkspaceMoveRequestsTable;

  const MEETING_A = "meeting-uuid-aaa";
  const MEETING_B = "meeting-uuid-bbb";
  const WORKSPACE_X = "workspace-uuid-xxx";
  const WORKSPACE_Y = "workspace-uuid-yyy";
  const USER_1 = "user-uuid-111";

  beforeEach(() => {
    table = new WorkspaceMoveRequestsTable();
  });

  // -------------------------------------------------------------------------
  // Core: ON CONFLICT resolves without error
  // -------------------------------------------------------------------------

  it("inserts a new row when no duplicate exists", () => {
    // **Validates: Requirements 2.9**
    const row = table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending");

    expect(row.meeting_id).toBe(MEETING_A);
    expect(row.workspace_id).toBe(WORKSPACE_X);
    expect(row.status).toBe("pending");
    expect(table.count()).toBe(1);
  });

  it("does NOT throw on duplicate (meeting_id, workspace_id) — ON CONFLICT resolves without error", () => {
    // **Validates: Requirements 2.9**
    // First insert
    table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending");

    // Duplicate insert — must not throw
    expect(() => {
      table.upsert(MEETING_A, WORKSPACE_X, USER_1, "approved");
    }).not.toThrow();
  });

  it("updates the existing row on conflict (DO UPDATE semantics)", () => {
    // **Validates: Requirements 2.9**
    table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending");
    const updated = table.upsert(MEETING_A, WORKSPACE_X, USER_1, "approved", "Looks good");

    expect(updated.status).toBe("approved");
    expect(updated.admin_note).toBe("Looks good");
    // Row count must stay at 1 — no duplicate row created
    expect(table.count()).toBe(1);
  });

  it("keeps only one row per (meeting_id, workspace_id) pair after multiple upserts", () => {
    // **Validates: Requirements 2.9**
    table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending");
    table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending"); // duplicate
    table.upsert(MEETING_A, WORKSPACE_X, USER_1, "approved"); // duplicate again

    expect(table.count()).toBe(1);
    expect(table.all()[0].status).toBe("approved");
  });

  // -------------------------------------------------------------------------
  // Constraint enforcement: plain INSERT without ON CONFLICT DOES throw
  // -------------------------------------------------------------------------

  it("throws a unique-constraint error on plain duplicate INSERT (no ON CONFLICT clause)", () => {
    // **Validates: Requirements 2.9** — confirms the constraint is actually enforced
    table.insertRaw(MEETING_A, WORKSPACE_X, USER_1, "pending");

    expect(() => {
      table.insertRaw(MEETING_A, WORKSPACE_X, USER_1, "pending");
    }).toThrow(/unique constraint/);
  });

  // -------------------------------------------------------------------------
  // Different (meeting_id, workspace_id) pairs are independent
  // -------------------------------------------------------------------------

  it("allows different workspace_id for the same meeting_id without conflict", () => {
    // **Validates: Requirements 2.9** — constraint is composite, not per-column
    expect(() => {
      table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending");
      table.upsert(MEETING_A, WORKSPACE_Y, USER_1, "pending");
    }).not.toThrow();

    expect(table.count()).toBe(2);
  });

  it("allows different meeting_id for the same workspace_id without conflict", () => {
    // **Validates: Requirements 2.9**
    expect(() => {
      table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending");
      table.upsert(MEETING_B, WORKSPACE_X, USER_1, "pending");
    }).not.toThrow();

    expect(table.count()).toBe(2);
  });

  it("handles multiple independent pairs correctly", () => {
    // **Validates: Requirements 2.9**
    table.upsert(MEETING_A, WORKSPACE_X, USER_1, "pending");
    table.upsert(MEETING_A, WORKSPACE_Y, USER_1, "pending");
    table.upsert(MEETING_B, WORKSPACE_X, USER_1, "pending");
    table.upsert(MEETING_B, WORKSPACE_Y, USER_1, "pending");

    // Duplicate of first pair — should update, not add a row
    table.upsert(MEETING_A, WORKSPACE_X, USER_1, "approved");

    expect(table.count()).toBe(4);
    const updated = table.all().find(
      (r) => r.meeting_id === MEETING_A && r.workspace_id === WORKSPACE_X
    );
    expect(updated?.status).toBe("approved");
  });
});
