/**
 * Scroll to the element matching `window.location.hash` once it exists.
 * Used after async page shells mount (e.g. tenant landing) so deep links like
 * `/#available-homes` still land on the target section.
 */
export function scrollToHashTarget(options?: {
  /** Max time to wait for the target to appear (ms). */
  timeoutMs?: number;
}): () => void {
  if (typeof window === "undefined") return () => undefined;

  const raw = window.location.hash;
  if (!raw || raw === "#") return () => undefined;

  let id: string;
  try {
    id = decodeURIComponent(raw.slice(1));
  } catch {
    id = raw.slice(1);
  }
  if (!id) return () => undefined;

  const timeoutMs = options?.timeoutMs ?? 4000;
  const preferReduced =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  let cancelled = false;
  let raf = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const started = Date.now();

  const tryScroll = (): boolean => {
    const el = document.getElementById(id);
    if (!el) return false;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({
        behavior: preferReduced ? "auto" : "smooth",
        block: "start",
      });
    }
    return true;
  };

  const tick = () => {
    if (cancelled) return;
    if (tryScroll()) return;
    if (Date.now() - started >= timeoutMs) return;
    timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 50);
  };

  // Prefer an immediate scroll when the target is already in the DOM.
  if (tryScroll()) {
    return () => {
      cancelled = true;
    };
  }

  raf = requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    if (timer !== undefined) clearTimeout(timer);
  };
}
