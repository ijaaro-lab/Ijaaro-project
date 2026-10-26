import { describe, expect, it } from "vitest";
import { validatePasswordPair } from "./passwordForm";

describe("password form validation", () => {
  it("rejects mismatch", () => {
    const result = validatePasswordPair("password1", "password2");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/do not match/i);
  });

  it("rejects short passwords", () => {
    const result = validatePasswordPair("short", "short");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at least 8/i);
  });

  it("accepts matching valid passwords", () => {
    expect(validatePasswordPair("password1", "password1")).toEqual({
      ok: true,
      password: "password1",
    });
  });
});
