/**
 * RP-1.3.31 — session/JWT coherence helpers.
 * Prevents a slow initial getSession() from overwriting a newer SIGNED_IN / signIn session.
 */

/** True when the mount-time getSession() result is still current (no newer auth commit). */
export function shouldApplyInitialSession(
  epochAtStart: number,
  currentEpoch: number,
): boolean {
  return currentEpoch === epochAtStart;
}

export type SessionLike = { user?: { id?: string | null } | null } | null;

/**
 * Poll the Supabase client until storage/session matches the expected user.
 * Does not sign out on failure — callers keep any React session already committed.
 */
export async function confirmClientSession(
  getSession: () => Promise<{ data: { session: SessionLike } }>,
  expectedUserId: string,
  options?: { attempts?: number; delayMs?: number },
): Promise<SessionLike> {
  const attempts = options?.attempts ?? 5;
  const delayMs = options?.delayMs ?? 20;
  const expected = expectedUserId.trim();
  if (!expected) return null;

  for (let i = 0; i < attempts; i += 1) {
    const {
      data: { session },
    } = await getSession();
    if (session?.user?.id === expected) return session;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}
