import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  confirmClientSession,
  shouldApplyInitialSession,
} from "@/auth/authSessionCoherence";
import { resolveSignupEmailRedirectTo } from "@/lib/signupEmailRedirect";
import { supabase } from "@/lib/supabase";
import type { AppRole, Profile, Tenant, TenantMembership } from "@/types/database";

export type MembershipWithTenant = TenantMembership & { tenant: Tenant };

export type SignUpOptions = {
  /** Same-origin `/apply?tenant=&property=` only; invalid values fall back to `/login`. */
  emailRedirectTo?: string;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: MembershipWithTenant[];
  loading: boolean;
  isSuperAdmin: boolean;
  activeMembership: MembershipWithTenant | null;
  setActiveMembershipId: (id: string | null) => void;
  /** Optional userId skips a storage getSession() (avoids auth-callback races). */
  refreshMemberships: (userId?: string) => Promise<MembershipWithTenant[]>;
  refreshProfile: () => Promise<void>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; session: Session | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    options?: SignUpOptions,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  primaryRole: AppRole | null;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithTenant[]>([]);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Increments on every authoritative session commit (auth event / sign-in). */
  const authEpochRef = useRef(0);
  const membershipsRef = useRef<MembershipWithTenant[]>([]);
  membershipsRef.current = memberships;

  const commitSession = useCallback((next: Session | null) => {
    authEpochRef.current += 1;
    setSession(next);
    if (!next?.user) {
      setProfile(null);
      setMemberships([]);
      setActiveMembershipId(null);
    }
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data);
  }, []);

  const refreshMemberships = useCallback(
    async (userId?: string): Promise<MembershipWithTenant[]> => {
      let uid = userId?.trim() || "";
      if (!uid) {
        const {
          data: { session: current },
        } = await supabase.auth.getSession();
        uid = current?.user?.id ?? "";
      }
      if (!uid) {
        // Transient missing storage session must not wipe memberships already loaded
        // for a still-valid React session (RP-1.3.31). Real sign-out clears via commitSession.
        return membershipsRef.current;
      }

      // RLS lets landlord/utility admins SELECT peer memberships on their tenant
      // (needed for ops UIs). The workspace switcher must only list *this* user's rows.
      const { data } = await supabase
        .from("tenant_memberships")
        .select("*, tenant:tenants(*)")
        .eq("status", "active")
        .eq("user_id", uid);

      const rows = (
        (data ?? []) as Array<TenantMembership & { tenant: Tenant | Tenant[] | null }>
      ).map((row) => {
        const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
        return { ...row, tenant } as MembershipWithTenant;
      });
      const mine = rows.filter((r) => r.tenant);
      setMemberships(mine);
      return mine;
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    if (current?.user) await loadProfile(current.user.id);
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;
    const epochAtStart = authEpochRef.current;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      // Stale null/session from mount must not overwrite a newer SIGNED_IN / signIn.
      if (!shouldApplyInitialSession(epochAtStart, authEpochRef.current)) {
        setLoading(false);
        return;
      }
      commitSession(data.session);
      if (data.session?.user) {
        await Promise.all([
          loadProfile(data.session.user.id),
          refreshMemberships(data.session.user.id),
        ]);
      }
      if (mounted) setLoading(false);
    });

    // Keep this callback synchronous. Awaiting Supabase auth/DB calls here can
    // deadlock the auth client and make a later getSession() return null
    // (see supabase/auth-js#762). Defer profile/membership loads — but keep
    // `loading` true until they finish so RoleRoute does not flash Unauthorized.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      commitSession(next);
      if (next?.user) {
        const userId = next.user.id;
        setLoading(true);
        window.setTimeout(() => {
          if (!mounted) return;
          void Promise.all([loadProfile(userId), refreshMemberships(userId)]).finally(() => {
            if (mounted) setLoading(false);
          });
        }, 0);
        return;
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [commitSession, loadProfile, refreshMemberships]);

  const isSuperAdmin = useMemo(
    () =>
      memberships.some(
        (m) =>
          m.role === "super_admin" &&
          m.tenant.tenant_type === "platform" &&
          m.tenant.status === "active",
      ),
    [memberships],
  );

  const activeMembership = useMemo(() => {
    if (activeMembershipId) {
      return memberships.find((m) => m.id === activeMembershipId) ?? null;
    }
    return memberships[0] ?? null;
  }, [activeMembershipId, memberships]);

  const primaryRole = activeMembership?.role ?? (isSuperAdmin ? "super_admin" : null);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { error: error.message ?? null, session: null };
    }
    if (!data.session?.user) {
      return { error: null, session: null };
    }

    // Authoritative React commit (bumps epoch so a late mount getSession cannot clear it).
    commitSession(data.session);

    // Do not navigate until the client can read the same user from getSession (JWT installed).
    const confirmed = await confirmClientSession(
      () => supabase.auth.getSession(),
      data.session.user.id,
    );
    if (!confirmed?.user) {
      // Keep React session; do not signOut on a transient client read miss.
      return { error: null, session: data.session };
    }
    return {
      error: null,
      session: confirmed as Session,
    };
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    options?: SignUpOptions,
  ) => {
    const emailRedirectTo = resolveSignupEmailRedirectTo(
      window.location.origin,
      options?.emailRedirectTo,
    );
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo,
      },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    // Supabase returns a user with empty identities when email confirmation is required
    // and the address was already registered (anti-enumeration). Treat missing session as confirmation pending.
    const needsConfirmation = !data.session;
    // Best-effort Resend welcome (JWT required — only when signup returns a session).
    if (data.session) {
      void supabase.functions.invoke("send-welcome-email", {
        body: {
          full_name: fullName,
          workspace_url: window.location.origin,
        },
      });
    }
    return { error: null, needsConfirmation };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    memberships,
    loading,
    isSuperAdmin,
    activeMembership,
    setActiveMembershipId,
    refreshMemberships,
    refreshProfile,
    signIn,
    signUp,
    signOut,
    primaryRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
