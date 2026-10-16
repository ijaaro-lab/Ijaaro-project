-- IJAARO Phase 2: Properties, photos, rental assignments, storage, assign/move-out RPCs
-- Does not modify Phase 1 migrations. Preserves existing RLS helpers and patterns.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.property_status AS ENUM ('available', 'occupied', 'vacant');
CREATE TYPE public.property_type AS ENUM ('apartment', 'house', 'shop', 'office', 'other');
CREATE TYPE public.assignment_status AS ENUM ('invited', 'active', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_landlord_ops(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(
    p_tenant_id,
    ARRAY['landlord_admin', 'landlord_staff']::public.app_role[]
  );
$$;

CREATE OR REPLACE FUNCTION public.can_approve_rent(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND t.tenant_type = 'landlord'
      AND t.status IN ('active', 'pending')
      AND (
        tm.role = 'landlord_admin'
        OR (
          tm.role = 'landlord_staff'
          AND COALESCE((tm.permissions->>'approve_rent')::boolean, false) = true
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_landlord_ops(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_approve_rent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_landlord_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_rent(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  current_renter_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  name text,
  address_line text NOT NULL,
  district text,
  city text,
  property_type public.property_type NOT NULL DEFAULT 'apartment',
  description text,
  rent_amount numeric(12, 2),
  currency text NOT NULL DEFAULT 'USD',
  status public.property_status NOT NULL DEFAULT 'available',
  contact_phone text,
  contact_email text,
  created_by_tenant_id uuid REFERENCES public.tenants (id) ON DELETE SET NULL,
  created_source text NOT NULL DEFAULT 'landlord',
  is_listed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT properties_rent_amount_nonneg CHECK (rent_amount IS NULL OR rent_amount >= 0),
  CONSTRAINT properties_currency_len CHECK (char_length(currency) BETWEEN 3 AND 8),
  CONSTRAINT properties_created_source_check CHECK (
    created_source IN ('landlord', 'water_company', 'electricity_company')
  ),
  CONSTRAINT properties_occupied_has_renter CHECK (
    (status = 'occupied' AND current_renter_id IS NOT NULL)
    OR (status <> 'occupied')
  )
);

CREATE INDEX idx_properties_tenant_status ON public.properties (tenant_id, status);
CREATE INDEX idx_properties_listed_available
  ON public.properties (status, is_listed, district, city)
  WHERE is_listed = true AND status = 'available';
CREATE INDEX idx_properties_current_renter
  ON public.properties (current_renter_id)
  WHERE current_renter_id IS NOT NULL;
CREATE INDEX idx_properties_owner ON public.properties (owner_id);

CREATE TRIGGER properties_set_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Occupancy fields only change via trusted SECURITY DEFINER RPCs
CREATE OR REPLACE FUNCTION public.protect_property_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.current_renter_id IS DISTINCT FROM OLD.current_renter_id THEN
      RAISE EXCEPTION 'current_renter_id may only change via assign/move-out workflows'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND (NEW.status = 'occupied' OR OLD.status = 'occupied') THEN
      RAISE EXCEPTION 'occupied status may only change via assign/move-out workflows'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'property tenant_id is immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_protect_occupancy
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.protect_property_occupancy();

CREATE OR REPLACE FUNCTION public.validate_property_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type public.tenant_type;
BEGIN
  SELECT tenant_type INTO v_type FROM public.tenants WHERE id = NEW.tenant_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;
  IF v_type <> 'landlord' AND NEW.created_source = 'landlord' THEN
    RAISE EXCEPTION 'landlord-created properties require a landlord tenant';
  END IF;
  IF NEW.created_by_tenant_id IS NULL THEN
    NEW.created_by_tenant_id := NEW.tenant_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER properties_validate_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, created_source ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.validate_property_tenant();

-- ---------------------------------------------------------------------------
-- property_photos
-- ---------------------------------------------------------------------------
CREATE TABLE public.property_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_photos_path_unique UNIQUE (storage_path),
  CONSTRAINT property_photos_sort_nonneg CHECK (sort_order >= 0)
);

CREATE INDEX idx_property_photos_property
  ON public.property_photos (property_id, sort_order);

CREATE OR REPLACE FUNCTION public.sync_property_photo_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.properties WHERE id = NEW.property_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'property not found';
  END IF;
  NEW.tenant_id := v_tenant;
  RETURN NEW;
END;
$$;

CREATE TRIGGER property_photos_sync_tenant
  BEFORE INSERT OR UPDATE OF property_id, tenant_id ON public.property_photos
  FOR EACH ROW EXECUTE FUNCTION public.sync_property_photo_tenant();

-- ---------------------------------------------------------------------------
-- rental_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE public.rental_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  landlord_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  renter_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  rent_amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  due_day integer,
  start_date date NOT NULL,
  end_date date,
  status public.assignment_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_assignments_rent_positive CHECK (rent_amount >= 0),
  CONSTRAINT rental_assignments_due_day CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 28)),
  CONSTRAINT rental_assignments_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT rental_assignments_currency_len CHECK (char_length(currency) BETWEEN 3 AND 8)
);

CREATE INDEX idx_rental_assignments_tenant ON public.rental_assignments (tenant_id, status);
CREATE INDEX idx_rental_assignments_property ON public.rental_assignments (property_id, status);
CREATE INDEX idx_rental_assignments_renter ON public.rental_assignments (renter_id, status);

-- At most one invited/active assignment per property
CREATE UNIQUE INDEX uq_rental_assignments_open_per_property
  ON public.rental_assignments (property_id)
  WHERE status IN ('invited', 'active');

CREATE TRIGGER rental_assignments_set_updated_at
  BEFORE UPDATE ON public.rental_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_assignment_immutables()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.renter_id IS DISTINCT FROM OLD.renter_id
       OR NEW.landlord_id IS DISTINCT FROM OLD.landlord_id THEN
      RAISE EXCEPTION 'assignment identity fields are immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'assignment status may only change via assign/move-out workflows'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rental_assignments_protect_immutables
  BEFORE UPDATE ON public.rental_assignments
  FOR EACH ROW EXECUTE FUNCTION public.protect_assignment_immutables();

-- Block direct INSERT/DELETE of assignments from clients; use RPCs
CREATE OR REPLACE FUNCTION public.block_direct_assignment_dml()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'rental assignments must be created/closed via assign_renter / complete_move_out'
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER rental_assignments_block_direct_insert
  BEFORE INSERT ON public.rental_assignments
  FOR EACH ROW EXECUTE FUNCTION public.block_direct_assignment_dml();

CREATE TRIGGER rental_assignments_block_direct_delete
  BEFORE DELETE ON public.rental_assignments
  FOR EACH ROW EXECUTE FUNCTION public.block_direct_assignment_dml();

CREATE OR REPLACE FUNCTION public.is_assignment_renter(p_assignment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.rental_assignments ra
    WHERE ra.id = p_assignment_id
      AND ra.renter_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_assignment_renter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_assignment_renter(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: properties
-- ---------------------------------------------------------------------------
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties FORCE ROW LEVEL SECURITY;

CREATE POLICY properties_select ON public.properties
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(tenant_id)
    OR (is_listed = true AND status = 'available')
    OR current_renter_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.rental_assignments ra
      WHERE ra.property_id = properties.id
        AND ra.renter_id = auth.uid()
    )
    OR public.is_super_admin()
  );

CREATE POLICY properties_insert ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_landlord_ops(tenant_id)
    AND owner_id = auth.uid()
    AND current_renter_id IS NULL
    AND status IN ('available', 'vacant')
  );

CREATE POLICY properties_update ON public.properties
  FOR UPDATE TO authenticated
  USING (public.can_manage_landlord_ops(tenant_id))
  WITH CHECK (public.can_manage_landlord_ops(tenant_id));

CREATE POLICY properties_delete ON public.properties
  FOR DELETE TO authenticated
  USING (
    public.has_role(tenant_id, ARRAY['landlord_admin']::public.app_role[])
    AND status <> 'occupied'
    AND current_renter_id IS NULL
  );

-- ---------------------------------------------------------------------------
-- RLS: property_photos
-- ---------------------------------------------------------------------------
ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_photos FORCE ROW LEVEL SECURITY;

CREATE POLICY property_photos_select ON public.property_photos
  FOR SELECT TO authenticated
  USING (
    public.is_member_of(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_photos.property_id
        AND (
          (p.is_listed = true AND p.status = 'available')
          OR p.current_renter_id = auth.uid()
        )
    )
    OR public.is_super_admin()
  );

CREATE POLICY property_photos_insert ON public.property_photos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_landlord_ops(tenant_id));

CREATE POLICY property_photos_update ON public.property_photos
  FOR UPDATE TO authenticated
  USING (public.can_manage_landlord_ops(tenant_id))
  WITH CHECK (public.can_manage_landlord_ops(tenant_id));

CREATE POLICY property_photos_delete ON public.property_photos
  FOR DELETE TO authenticated
  USING (public.can_manage_landlord_ops(tenant_id));

-- ---------------------------------------------------------------------------
-- RLS: rental_assignments
-- ---------------------------------------------------------------------------
ALTER TABLE public.rental_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY rental_assignments_select ON public.rental_assignments
  FOR SELECT TO authenticated
  USING (
    public.can_manage_landlord_ops(tenant_id)
    OR renter_id = auth.uid()
    OR public.is_super_admin()
  );

-- Mutations go through SECURITY DEFINER RPCs (bypass RLS as table owner / definer)
CREATE POLICY rental_assignments_no_direct_insert ON public.rental_assignments
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY rental_assignments_update_notes ON public.rental_assignments
  FOR UPDATE TO authenticated
  USING (public.can_manage_landlord_ops(tenant_id))
  WITH CHECK (public.can_manage_landlord_ops(tenant_id));

CREATE POLICY rental_assignments_no_direct_delete ON public.rental_assignments
  FOR DELETE TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-photos',
  'property-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path convention: {tenant_id}/{property_id}/{uuid}.ext
CREATE POLICY property_photos_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND (
      public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
      OR public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.properties p
        WHERE p.id = (storage.foldername(name))[2]::uuid
          AND (
            (p.is_listed = true AND p.status = 'available')
            OR p.current_renter_id = auth.uid()
            OR public.is_member_of(p.tenant_id)
          )
      )
    )
  );

CREATE POLICY property_photos_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-photos'
    AND public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = (storage.foldername(name))[2]::uuid
        AND p.tenant_id = (storage.foldername(name))[1]::uuid
    )
  );

CREATE POLICY property_photos_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
  )
  WITH CHECK (
    bucket_id = 'property-photos'
    AND public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
  );

CREATE POLICY property_photos_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-photos'
    AND public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------------
-- RPCs: assign_renter / complete_move_out
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_renter(
  p_property_id uuid,
  p_renter_id uuid,
  p_rent_amount numeric,
  p_start_date date,
  p_due_day integer DEFAULT NULL,
  p_currency text DEFAULT 'USD',
  p_notes text DEFAULT NULL,
  p_create_initial_charge boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_property public.properties%ROWTYPE;
  v_assignment public.rental_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_property FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found';
  END IF;

  IF NOT public.can_manage_landlord_ops(v_property.tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_property.status = 'occupied' OR v_property.current_renter_id IS NOT NULL THEN
    RAISE EXCEPTION 'property already occupied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.rental_assignments
    WHERE property_id = p_property_id AND status IN ('invited', 'active')
  ) THEN
    RAISE EXCEPTION 'property already has an open assignment';
  END IF;

  IF p_rent_amount IS NULL OR p_rent_amount < 0 THEN
    RAISE EXCEPTION 'invalid rent amount';
  END IF;

  IF p_due_day IS NOT NULL AND (p_due_day < 1 OR p_due_day > 28) THEN
    RAISE EXCEPTION 'due_day must be between 1 and 28';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_memberships tm
    WHERE tm.tenant_id = v_property.tenant_id
      AND tm.user_id = p_renter_id
      AND tm.role = 'renter'
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'renter must have an active renter membership on this landlord tenant';
  END IF;

  -- p_create_initial_charge is honored after rent_charges exist (see phase2_rent_ledger).
  PERFORM set_config('ijaaro.internal', '1', true);

  INSERT INTO public.rental_assignments (
    tenant_id, property_id, landlord_id, renter_id,
    rent_amount, currency, due_day, start_date, status, notes
  ) VALUES (
    v_property.tenant_id,
    v_property.id,
    auth.uid(),
    p_renter_id,
    p_rent_amount,
    COALESCE(NULLIF(trim(p_currency), ''), COALESCE(v_property.currency, 'USD')),
    p_due_day,
    COALESCE(p_start_date, CURRENT_DATE),
    'active',
    p_notes
  )
  RETURNING * INTO v_assignment;

  UPDATE public.properties
  SET
    current_renter_id = p_renter_id,
    status = 'occupied',
    is_listed = false,
    updated_at = now()
  WHERE id = v_property.id;

  PERFORM public._insert_audit_log(
    v_assignment.tenant_id,
    auth.uid(),
    'rental.assign',
    'rental_assignment',
    v_assignment.id,
    jsonb_build_object(
      'property_id', v_property.id,
      'renter_id', p_renter_id,
      'rent_amount', p_rent_amount,
      'create_initial_charge_requested', p_create_initial_charge
    )
  );

  RETURN jsonb_build_object(
    'assignment', to_jsonb(v_assignment),
    'initial_charge_id', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_move_out(
  p_assignment_id uuid,
  p_end_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.rental_assignments%ROWTYPE;
  v_property public.properties%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_assignment
  FROM public.rental_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;

  IF NOT public.can_manage_landlord_ops(v_assignment.tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_assignment.status <> 'active' THEN
    RAISE EXCEPTION 'only active assignments can be completed';
  END IF;

  SELECT * INTO v_property FROM public.properties WHERE id = v_assignment.property_id FOR UPDATE;

  PERFORM set_config('ijaaro.internal', '1', true);

  UPDATE public.rental_assignments
  SET
    status = 'completed',
    end_date = COALESCE(p_end_date, CURRENT_DATE),
    notes = CASE
      WHEN p_notes IS NULL OR length(trim(p_notes)) = 0 THEN notes
      WHEN notes IS NULL OR length(trim(notes)) = 0 THEN p_notes
      ELSE notes || E'\n' || p_notes
    END,
    updated_at = now()
  WHERE id = v_assignment.id
  RETURNING * INTO v_assignment;

  UPDATE public.properties
  SET
    current_renter_id = NULL,
    status = 'available',
    updated_at = now()
  WHERE id = v_property.id;

  PERFORM public._insert_audit_log(
    v_assignment.tenant_id,
    auth.uid(),
    'rental.move_out',
    'rental_assignment',
    v_assignment.id,
    jsonb_build_object(
      'property_id', v_property.id,
      'renter_id', v_assignment.renter_id,
      'end_date', v_assignment.end_date
    )
  );

  RETURN jsonb_build_object('assignment', to_jsonb(v_assignment));
END;
$$;

REVOKE ALL ON FUNCTION public.assign_renter(uuid, uuid, numeric, date, integer, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_move_out(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_renter(uuid, uuid, numeric, date, integer, text, text, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.complete_move_out(uuid, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_renter(uuid, uuid, numeric, date, integer, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_move_out(uuid, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.protect_property_occupancy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_property_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_property_photo_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_assignment_immutables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_direct_assignment_dml() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_property_occupancy() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_property_tenant() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_property_photo_tenant() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_assignment_immutables() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.block_direct_assignment_dml() FROM anon, authenticated;
