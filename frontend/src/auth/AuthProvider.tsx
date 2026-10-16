import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AppRole, Profile, Tenant, TenantMembership } from "@/types/database";

export type MembershipWithTenant = TenantMembership & { tenant: Tenant };

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: MembershipWithTenant[];
  loading: boolean;
  isSuperAdmin: boolean;
  activeMembership: MembershipWithTenant | null;
  setActiveMembershipId: (id: string | null) => void;
  refreshMemberships: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
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

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data);
  }, []);

  const refreshMemberships = useCallback(async () => {
    const { data } = await supabase
      .from("tenant_memberships")
      .select("*, tenant:tenants(*)")
      .eq("status", "active");

    const rows = ((data ?? []) as Array<TenantMembership & { tenant: Tenant | Tenant[] | null }>).map(
      (row) => {
        const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
        return { ...row, tenant } as MembershipWithTenant;
      },
    );
    setMemberships(rows.filter((r) => r.tenant));
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    if (current?.user) await loadProfile(current.user.id);
  }, [loadProfile]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        await Promise.all([
          loadProfile(data.session.user.id),
          refreshMemberships(),
        ]);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next?.user) {
        await Promise.all([loadProfile(next.user.id), refreshMemberships()]);
      } else {
        setProfile(null);
        setMemberships([]);
        setActiveMembershipId(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, refreshMemberships]);

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
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) return { error: error.message, needsConfirmation: false };
    // Supabase returns a user with empty identities when email confirmation is required
    // and the address was already registered (anti-enumeration). Treat missing session as confirmation pending.
    const needsConfirmation = !data.session;
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
