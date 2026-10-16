-- ONE-TIME Super Admin bootstrap (run in Supabase SQL Editor as postgres / service role).
-- NEVER expose this as a public HTTP endpoint.
--
-- Prerequisites:
-- 1. Apply Phase 1 migrations.
-- 2. Create the first Auth user via Dashboard → Authentication → Users (or signup).
-- 3. Replace :user_id below with that user's UUID.
--
-- After running, sign in as that user. They will have platform Super Admin access.

-- Example (edit the UUID):
-- \set user_id '00000000-0000-0000-0000-000000000000'

DO $$
DECLARE
  v_user_id uuid := NULL; -- <<< PASTE auth.users.id HERE
  v_platform_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Set v_user_id to the Auth user UUID before running';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    INSERT INTO public.profiles (id, full_name, email)
    SELECT id, COALESCE(raw_user_meta_data->>'full_name', email), email
    FROM auth.users
    WHERE id = v_user_id
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.tenants (name, slug, tenant_type, status)
  VALUES ('IJAARO Platform', 'platform', 'platform', 'active')
  ON CONFLICT (slug) DO UPDATE
    SET status = 'active',
        name = EXCLUDED.name
  RETURNING id INTO v_platform_id;

  IF v_platform_id IS NULL THEN
    SELECT id INTO v_platform_id FROM public.tenants WHERE slug = 'platform';
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status)
  VALUES (v_platform_id, v_user_id, 'super_admin', 'active')
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET role = 'super_admin',
        status = 'active',
        updated_at = now();

  INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_platform_id,
    v_user_id,
    'bootstrap.super_admin',
    'tenant_membership',
    v_platform_id,
    jsonb_build_object('note', 'one-time SQL bootstrap')
  );
END $$;
