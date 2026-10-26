import { describe, expect, it, vi } from "vitest";
import {
  confirmClientSession,
  shouldApplyInitialSession,
} from "./authSessionCoherence";

describe("shouldApplyInitialSession (RP-1.3.31)", () => {
  it("applies mount getSession when no newer auth commit happened", () => {
    expect(shouldApplyInitialSession(0, 0)).toBe(true);
  });

  it("rejects stale mount getSession after SIGNED_IN / signIn bumped epoch", () => {
    expect(shouldApplyInitialSession(0, 1)).toBe(false);
    expect(shouldApplyInitialSession(0, 2)).toBe(false);
  });
});

describe("confirmClientSession (RP-1.3.31)", () => {
  it("returns session once getSession matches expected user", async () => {
    const session = { user: { id: "u1" } };
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session } });

    const confirmed = await confirmClientSession(getSession, "u1", {
      attempts: 3,
      delayMs: 1,
    });
    expect(confirmed).toEqual(session);
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("returns null without signing out semantics when client never ready", async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    const confirmed = await confirmClientSession(getSession, "u1", {
      attempts: 2,
      delayMs: 1,
    });
    expect(confirmed).toBeNull();
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
