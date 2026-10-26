import { describe, expect, it } from "vitest";
import { normalizeUsername, validateUsernameInput } from "./username";

describe("username normalization and uniqueness", () => {
  it("normalizes trim + lowercase", () => {
    expect(normalizeUsername("  Jane_Doe  ")).toBe("jane_doe");
  });

  it("accepts approved format", () => {
    expect(validateUsernameInput("abc")).toEqual({ ok: true, username: "abc" });
    expect(validateUsernameInput("a_b1")).toEqual({ ok: true, username: "a_b1" });
  });

  it("rejects invalid formats", () => {
    expect(validateUsernameInput("").ok).toBe(false);
    expect(validateUsernameInput("ab").ok).toBe(false);
    expect(validateUsernameInput("1abc").ok).toBe(false);
    expect(validateUsernameInput("Jane-Doe").ok).toBe(false);
    expect(validateUsernameInput("a".repeat(33)).ok).toBe(false);
  });

  it("rejects taken usernames using normalized uniqueness", () => {
    const result = validateUsernameInput("Jane_Doe", ["jane_doe"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already taken/i);
  });
});
