import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthProvider";

const getSession = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const onAuthStateChange = vi.fn();
const from = vi.fn();

let authCallback: ((event: string, session: unknown) => void) | null = null;

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signOut: (...args: unknown[]) => signOut(...args),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authCallback = cb;
        onAuthStateChange(cb);
        return {
          data: {
            subscription: { unsubscribe: vi.fn() },
          },
        };
      },
      signUp: vi.fn(),
    },
    from: (...args: unknown[]) => from(...args),
  },
}));

function Probe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useAuth>) => void;
}) {
  const api = useAuth();
  onReady(api);
  return (
    <div>
      <span data-testid="user">{api.user?.id ?? "none"}</span>
      <span data-testid="loading">{api.loading ? "yes" : "no"}</span>
    </div>
  );
}

describe("AuthProvider session / JWT coherence (RP-1.3.31)", () => {
  beforeEach(() => {
    getSession.mockReset();
    signInWithPassword.mockReset();
    signOut.mockReset();
    onAuthStateChange.mockReset();
    from.mockReset();
    authCallback = null;

    const emptyQuery = {
      select: () => emptyQuery,
      eq: () => emptyQuery,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    from.mockReturnValue(emptyQuery);

    getSession.mockResolvedValue({ data: { session: null } });
  });

  it("does not let a stale mount getSession(null) clear a newer SIGNED_IN session", async () => {
    let resolveMountGetSession!: (value: unknown) => void;
    getSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMountGetSession = resolve;
        }),
    );

    let api: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider>
        <Probe onReady={(a) => {
          api = a;
        }} />
      </AuthProvider>,
    );

    await waitFor(() => expect(authCallback).toBeTruthy());

    const signedIn = { user: { id: "u-renter" }, access_token: "tok" };
    act(() => {
      authCallback?.("SIGNED_IN", signedIn);
    });

    await waitFor(() => {
      expect(api?.user?.id).toBe("u-renter");
    });

    // Late mount getSession resolves null — must not wipe the signed-in session.
    await act(async () => {
      resolveMountGetSession({ data: { session: null } });
    });

    await waitFor(() => {
      expect(api?.user?.id).toBe("u-renter");
      expect(api?.loading).toBe(false);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("signIn confirms client getSession before returning session", async () => {
    const signedIn = { user: { id: "u-renter" }, access_token: "tok" };
    signInWithPassword.mockResolvedValue({
      data: { session: signedIn, user: signedIn.user },
      error: null,
    });
    // Mount getSession
    getSession.mockResolvedValueOnce({ data: { session: null } });
    // confirmClientSession polls
    getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: signedIn } });

    const apiRef: { current: ReturnType<typeof useAuth> | null } = {
      current: null,
    };
    render(
      <AuthProvider>
        <Probe
          onReady={(a) => {
            apiRef.current = a;
          }}
        />
      </AuthProvider>,
    );

    await waitFor(() => expect(apiRef.current && !apiRef.current.loading).toBeTruthy());

    const auth = apiRef.current!;
    let result = { error: "unset" as string | null, session: null as null | { user: { id: string } } };
    await act(async () => {
      result = await auth.signIn("renter@example.com", "not-a-real-secret");
    });

    expect(result.error).toBeNull();
    expect(result.session?.user.id).toBe("u-renter");
    expect(apiRef.current?.user?.id).toBe("u-renter");
    expect(signOut).not.toHaveBeenCalled();
  });
});
