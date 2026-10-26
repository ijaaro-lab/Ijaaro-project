import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scrollToHashTarget } from "./scrollToHashTarget";

describe("scrollToHashTarget", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "requestAnimationFrame"] });
    window.history.replaceState({}, "", "/?tenant=hodan-properties");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("no-ops when there is no hash", () => {
    const cancel = scrollToHashTarget();
    expect(typeof cancel).toBe("function");
    cancel();
  });

  it("scrolls to the hash target when it already exists", () => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties#available-homes");
    const el = document.createElement("section");
    el.id = "available-homes";
    const scrollIntoView = vi.fn();
    Object.defineProperty(el, "scrollIntoView", { value: scrollIntoView, configurable: true });
    document.body.appendChild(el);

    const cancel = scrollToHashTarget();
    vi.advanceTimersByTime(0);

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    cancel();
  });

  it("retries until the target mounts, then scrolls once", () => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties#available-homes");
    const scrollIntoView = vi.fn();
    const cancel = scrollToHashTarget();

    vi.advanceTimersByTime(100);
    expect(scrollIntoView).not.toHaveBeenCalled();

    const el = document.createElement("section");
    el.id = "available-homes";
    Object.defineProperty(el, "scrollIntoView", { value: scrollIntoView, configurable: true });
    document.body.appendChild(el);

    vi.advanceTimersByTime(100);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("uses auto behavior when prefers-reduced-motion is set", () => {
    window.history.replaceState({}, "", "/?tenant=hodan-properties#available-homes");
    window.matchMedia = vi.fn(
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    );

    const el = document.createElement("section");
    el.id = "available-homes";
    const scrollIntoView = vi.fn();
    Object.defineProperty(el, "scrollIntoView", { value: scrollIntoView, configurable: true });
    document.body.appendChild(el);

    const cancel = scrollToHashTarget();
    vi.advanceTimersByTime(0);
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto", block: "start" }),
    );
    cancel();
  });
});
