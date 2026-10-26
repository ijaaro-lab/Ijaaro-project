import { describe, expect, it } from "vitest";
import { assertDevSupabaseTarget, isLoopbackSupabaseHost } from "./supabaseEnv";

describe("supabase local-dev host guard", () => {
  it("accepts loopback hosts", () => {
    expect(isLoopbackSupabaseHost("127.0.0.1")).toBe(true);
    expect(isLoopbackSupabaseHost("localhost")).toBe(true);
    expect(isLoopbackSupabaseHost("tjadzwrcllsbkrkkkzjd.supabase.co")).toBe(false);
  });

  it("blocks hosted hosts in DEV without override", () => {
    const result = assertDevSupabaseTarget("https://abc.supabase.co", {
      isDev: true,
      allowRemote: false,
    });
    expect(result.ok).toBe(false);
  });

  it("allows hosted hosts in DEV when explicitly opted in", () => {
    const result = assertDevSupabaseTarget("https://abc.supabase.co", {
      isDev: true,
      allowRemote: true,
    });
    expect(result.ok).toBe(true);
  });

  it("allows hosted hosts in production builds without override", () => {
    const result = assertDevSupabaseTarget("https://abc.supabase.co", {
      isDev: false,
      allowRemote: false,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts local URL in DEV", () => {
    const result = assertDevSupabaseTarget("http://127.0.0.1:54321", {
      isDev: true,
      allowRemote: false,
    });
    expect(result).toEqual({ ok: true, url: "http://127.0.0.1:54321" });
  });
});
