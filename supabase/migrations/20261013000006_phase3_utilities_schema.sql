-- IJAARO Phase 3–4 (Prompt 03): Water & Electricity utility management
-- Tables: utility_accounts, meters, meter_readings, utility_bills, utility_payments
-- Billing formula (BRD FR-054/055): units = current − previous; total = (units × unit_price) + extra_charges
-- OQ-07 working defaults (documented, not invented tariffs):
--   due_date = period_end + 14 days when not supplied
--   extra_charges from account.extra_charges_config.fixed_amount (else 0)
--   partial payments allowed; estimated readings stored but not billed
--   decreasing readings rejected unless status corrected/reset with reason

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.service_type AS ENUM ('water', 'electricity');
CREATE TYPE public.reading_status AS ENUM (
  'valid', 'estimated', 'corrected', 'reset', 'disputed'
);
CREATE TYPE public.bill_status AS ENUM (
  'draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled', 'disputed'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_utility_ops(p_tenant_id uuid)
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
      AND tm.role IN ('utility_admin', 'utility_staff')
      AND t.status = 'active'
      AND t.tenant_type IN ('water_company', 'electricity_company')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_approve_utility(p_tenant_id uuid)
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
      AND tm.role IN ('utility_admin', 'utility_staff')
      AND t.status = 'active'
      AND t.tenant_type IN ('water_company', 'electricity_company')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_utility_customer_of(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role = 'utility_customer'
  );
$$;

CREATE OR REPLACE FUNCTION public.service_type_for_tenant(p_tenant_id uuid)
RETURNS public.service_type
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.tenant_type;
BEGIN
  SELECT tenant_type INTO v_type FROM public.tenants WHERE id = p_tenant_id;
  IF v_type = 'water_company' THEN
    RETURN 'water'::public.service_type;
  ELSIF v_type = 'electricity_company' THEN
    RETURN 'electricity'::public.service_type;
  END IF;
  RAISE EXCEPTION 'tenant is not a utility company';
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_extra_charges(p_config jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_fixed numeric;
  v_sum numeric := 0;
  v_item jsonb;
BEGIN
  IF p_config IS NULL OR p_config = 'null'::jsonb THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(p_config->'fixed_amount') = 'number' THEN
    v_fixed := (p_config->>'fixed_amount')::numeric;
    IF v_fixed IS NOT NULL AND v_fixed >= 0 THEN
      RETURN round(v_fixed, 2);
    END IF;
  END IF;

  IF jsonb_typeof(p_config->'items') = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_config->'items')
    LOOP
      IF jsonb_typeof(v_item->'amount') = 'number' THEN
        v_sum := v_sum + GREATEST((v_item->>'amount')::numeric, 0);
      END IF;
    END LOOP;
    RETURN round(v_sum, 2);
  END IF;

  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.can_manage_utility_ops(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_approve_utility(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_utility_customer_of(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_type_for_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_extra_charges(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_utility_ops(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_approve_utility(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_utility_customer_of(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.service_type_for_tenant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_utility_ops(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_approve_utility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_utility_customer_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.service_type_for_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_extra_charges(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- utility_accounts
-- ---------------------------------------------------------------------------
CREATE TABLE public.utility_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  service_type public.service_type NOT NULL,
  account_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended', 'closed')),
  effective_from date,
  effective_to date,
  unit_price numeric(12, 4) NOT NULL DEFAULT 0
    CHECK (unit_price >= 0),
  extra_charges_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utility_accounts_effective_range CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
  )
);

CREATE UNIQUE INDEX uq_utility_accounts_tenant_number
  ON public.utility_accounts (tenant_id, account_number);
CREATE UNIQUE INDEX uq_utility_accounts_tenant_property_service
  ON public.utility_accounts (tenant_id, property_id, service_type)
  WHERE status IN ('active', 'suspended');
CREATE INDEX idx_utility_accounts_tenant_status
  ON public.utility_accounts (tenant_id, status);
CREATE INDEX idx_utility_accounts_customer
  ON public.utility_accounts (customer_id, status);
CREATE INDEX idx_utility_accounts_property
  ON public.utility_accounts (property_id);

CREATE TRIGGER utility_accounts_set_updated_at
  BEFORE UPDATE ON public.utility_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_utility_account_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_expected public.service_type;
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  v_expected := public.service_type_for_tenant(NEW.tenant_id);
  IF NEW.service_type IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'service_type must match company tenant_type' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.service_type IS DISTINCT FROM OLD.service_type THEN
      RAISE EXCEPTION 'utility account identity fields are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER utility_accounts_enforce_tenant
  BEFORE INSERT OR UPDATE ON public.utility_accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_utility_account_tenant();

-- ---------------------------------------------------------------------------
-- meters
-- ---------------------------------------------------------------------------
CREATE TABLE public.meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  utility_account_id uuid NOT NULL REFERENCES public.utility_accounts (id) ON DELETE RESTRICT,
  meter_number text NOT NULL,
  service_type public.service_type NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'replaced', 'faulty')),
  installed_at date,
  replaced_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meters_replaced_after_install CHECK (
    replaced_at IS NULL OR installed_at IS NULL OR replaced_at >= installed_at
  )
);

CREATE UNIQUE INDEX uq_meters_tenant_number
  ON public.meters (tenant_id, meter_number);
CREATE INDEX idx_meters_account ON public.meters (utility_account_id, status);
CREATE INDEX idx_meters_tenant_status ON public.meters (tenant_id, status);

CREATE TRIGGER meters_set_updated_at
  BEFORE UPDATE ON public.meters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_meter_account_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_account public.utility_accounts%ROWTYPE;
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_account FROM public.utility_accounts WHERE id = NEW.utility_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility account not found';
  END IF;

  NEW.tenant_id := v_account.tenant_id;
  IF NEW.service_type IS DISTINCT FROM v_account.service_type THEN
    RAISE EXCEPTION 'meter service_type must match account' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.utility_account_id IS DISTINCT FROM OLD.utility_account_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'meter identity fields are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER meters_enforce_chain
  BEFORE INSERT OR UPDATE ON public.meters
  FOR EACH ROW EXECUTE FUNCTION public.enforce_meter_account_chain();

-- ---------------------------------------------------------------------------
-- meter_readings
-- ---------------------------------------------------------------------------
CREATE TABLE public.meter_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  meter_id uuid NOT NULL REFERENCES public.meters (id) ON DELETE RESTRICT,
  utility_account_id uuid NOT NULL REFERENCES public.utility_accounts (id) ON DELETE RESTRICT,
  reading_value numeric(14, 4) NOT NULL CHECK (reading_value >= 0),
  previous_reading_value numeric(14, 4) CHECK (previous_reading_value IS NULL OR previous_reading_value >= 0),
  reading_date date NOT NULL,
  units_consumed numeric(14, 4),
  status public.reading_status NOT NULL DEFAULT 'valid',
  recorded_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  correction_of_id uuid REFERENCES public.meter_readings (id) ON DELETE SET NULL,
  correction_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meter_readings_correction_reason CHECK (
    (status IN ('corrected', 'reset') AND correction_reason IS NOT NULL AND length(trim(correction_reason)) > 0)
    OR (status NOT IN ('corrected', 'reset'))
  ),
  CONSTRAINT meter_readings_units_nonneg CHECK (
    units_consumed IS NULL OR units_consumed >= 0
  )
);

CREATE INDEX idx_meter_readings_meter_date
  ON public.meter_readings (meter_id, reading_date DESC, created_at DESC);
CREATE INDEX idx_meter_readings_account
  ON public.meter_readings (utility_account_id, reading_date DESC);
CREATE INDEX idx_meter_readings_tenant
  ON public.meter_readings (tenant_id, reading_date DESC);
CREATE UNIQUE INDEX uq_meter_readings_one_valid_per_day
  ON public.meter_readings (meter_id, reading_date)
  WHERE status = 'valid';

CREATE TRIGGER meter_readings_set_updated_at
  BEFORE UPDATE ON public.meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- utility_bills
-- ---------------------------------------------------------------------------
CREATE TABLE public.utility_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  utility_account_id uuid NOT NULL REFERENCES public.utility_accounts (id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  meter_reading_id uuid NOT NULL REFERENCES public.meter_readings (id) ON DELETE RESTRICT,
  service_type public.service_type NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  previous_reading numeric(14, 4) NOT NULL,
  current_reading numeric(14, 4) NOT NULL,
  units_consumed numeric(14, 4) NOT NULL,
  unit_price numeric(12, 4) NOT NULL,
  extra_charges numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL,
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  balance numeric(12, 2) NOT NULL,
  due_date date NOT NULL,
  status public.bill_status NOT NULL DEFAULT 'issued',
  responsible_party_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  responsible_party_role text NOT NULL
    CHECK (responsible_party_role IN ('renter', 'owner', 'customer')),
  occupancy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utility_bills_period CHECK (period_end >= period_start),
  CONSTRAINT utility_bills_readings CHECK (current_reading >= previous_reading),
  CONSTRAINT utility_bills_amounts_nonneg CHECK (
    units_consumed >= 0
    AND unit_price >= 0
    AND extra_charges >= 0
    AND total_amount >= 0
    AND amount_paid >= 0
    AND balance >= 0
  ),
  CONSTRAINT utility_bills_balance_math CHECK (
    balance = round(total_amount - amount_paid, 2)
  )
);

CREATE INDEX idx_utility_bills_tenant_status
  ON public.utility_bills (tenant_id, status);
CREATE INDEX idx_utility_bills_account_period
  ON public.utility_bills (utility_account_id, period_start, period_end);
CREATE INDEX idx_utility_bills_responsible
  ON public.utility_bills (responsible_party_id, status);
CREATE INDEX idx_utility_bills_property
  ON public.utility_bills (property_id, due_date);
CREATE UNIQUE INDEX uq_utility_bills_account_period_active
  ON public.utility_bills (utility_account_id, period_start, period_end)
  WHERE status NOT IN ('cancelled');

CREATE TRIGGER utility_bills_set_updated_at
  BEFORE UPDATE ON public.utility_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_utility_bill_financials()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount_paid IS DISTINCT FROM OLD.amount_paid
       OR NEW.balance IS DISTINCT FROM OLD.balance
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
       OR NEW.units_consumed IS DISTINCT FROM OLD.units_consumed
       OR NEW.extra_charges IS DISTINCT FROM OLD.extra_charges
       OR NEW.responsible_party_id IS DISTINCT FROM OLD.responsible_party_id
       OR NEW.responsible_party_role IS DISTINCT FROM OLD.responsible_party_role THEN
      RAISE EXCEPTION 'bill financial/snapshot fields may only change via trusted workflows'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.utility_account_id IS DISTINCT FROM OLD.utility_account_id
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.meter_reading_id IS DISTINCT FROM OLD.meter_reading_id THEN
      RAISE EXCEPTION 'bill identity fields are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER utility_bills_protect_financials
  BEFORE UPDATE ON public.utility_bills
  FOR EACH ROW EXECUTE FUNCTION public.protect_utility_bill_financials();

-- ---------------------------------------------------------------------------
-- utility_payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.utility_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  utility_bill_id uuid NOT NULL REFERENCES public.utility_bills (id) ON DELETE RESTRICT,
  utility_account_id uuid NOT NULL REFERENCES public.utility_accounts (id) ON DELETE RESTRICT,
  payer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD'
    CHECK (char_length(currency) BETWEEN 3 AND 8),
  method public.payment_method NOT NULL DEFAULT 'mobile_money',
  reference text,
  provider text,
  provider_transaction_id text,
  idempotency_key text,
  proof_path text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT utility_payments_review_consistency CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('paid', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status IN ('processing', 'failed', 'cancelled', 'refunded'))
  )
);

CREATE INDEX idx_utility_payments_tenant_status
  ON public.utility_payments (tenant_id, status);
CREATE INDEX idx_utility_payments_bill
  ON public.utility_payments (utility_bill_id, status);
CREATE INDEX idx_utility_payments_payer
  ON public.utility_payments (payer_id, status);
CREATE INDEX idx_utility_payments_account
  ON public.utility_payments (utility_account_id, submitted_at DESC);

CREATE UNIQUE INDEX uq_utility_payments_provider_txn
  ON public.utility_payments (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX uq_utility_payments_idempotency
  ON public.utility_payments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX uq_utility_payments_one_pending
  ON public.utility_payments (utility_bill_id, payer_id)
  WHERE status = 'pending';

CREATE TRIGGER utility_payments_set_updated_at
  BEFORE UPDATE ON public.utility_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_utility_payment_submit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_bill public.utility_bills%ROWTYPE;
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_bill FROM public.utility_bills WHERE id = NEW.utility_bill_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'utility bill not found';
    END IF;

    NEW.tenant_id := v_bill.tenant_id;
    NEW.utility_account_id := v_bill.utility_account_id;
    NEW.payer_id := auth.uid();
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.submitted_at := now();

    -- Responsible party OR account customer may pay; landlords cannot approve (separate RPC).
    IF NEW.payer_id IS DISTINCT FROM v_bill.responsible_party_id
       AND NOT EXISTS (
         SELECT 1 FROM public.utility_accounts ua
         WHERE ua.id = v_bill.utility_account_id
           AND ua.customer_id = NEW.payer_id
       ) THEN
      RAISE EXCEPTION 'payer must be the responsible party or account customer'
        USING ERRCODE = '42501';
    END IF;

    IF v_bill.status IN ('cancelled', 'draft') THEN
      RAISE EXCEPTION 'cannot pay a cancelled or draft bill';
    END IF;

    IF NEW.amount > v_bill.balance THEN
      RAISE EXCEPTION 'payment amount exceeds outstanding balance';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.payer_id IS DISTINCT FROM OLD.payer_id
       OR NEW.utility_bill_id IS DISTINCT FROM OLD.utility_bill_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'payment review fields are immutable except via review_utility_payment'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER utility_payments_enforce_submit
  BEFORE INSERT OR UPDATE ON public.utility_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_utility_payment_submit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.utility_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_accounts FORCE ROW LEVEL SECURITY;

CREATE POLICY utility_accounts_select ON public.utility_accounts
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR customer_id = auth.uid()
    OR public.is_super_admin()
  );

CREATE POLICY utility_accounts_insert ON public.utility_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_utility_ops(tenant_id));

CREATE POLICY utility_accounts_update ON public.utility_accounts
  FOR UPDATE TO authenticated
  USING (public.can_manage_utility_ops(tenant_id))
  WITH CHECK (public.can_manage_utility_ops(tenant_id));

CREATE POLICY utility_accounts_no_delete ON public.utility_accounts
  FOR DELETE TO authenticated
  USING (false);

ALTER TABLE public.meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meters FORCE ROW LEVEL SECURITY;

CREATE POLICY meters_select ON public.meters
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.utility_accounts ua
      WHERE ua.id = meters.utility_account_id AND ua.customer_id = auth.uid()
    )
    OR public.is_super_admin()
  );

CREATE POLICY meters_insert ON public.meters
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_utility_ops(tenant_id));

CREATE POLICY meters_update ON public.meters
  FOR UPDATE TO authenticated
  USING (public.can_manage_utility_ops(tenant_id))
  WITH CHECK (public.can_manage_utility_ops(tenant_id));

CREATE POLICY meters_no_delete ON public.meters
  FOR DELETE TO authenticated
  USING (false);

ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings FORCE ROW LEVEL SECURITY;

CREATE POLICY meter_readings_select ON public.meter_readings
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.utility_accounts ua
      WHERE ua.id = meter_readings.utility_account_id AND ua.customer_id = auth.uid()
    )
    OR public.is_super_admin()
  );

-- Readings created via RPC; direct insert blocked for clients
CREATE POLICY meter_readings_no_direct_insert ON public.meter_readings
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY meter_readings_no_update ON public.meter_readings
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY meter_readings_no_delete ON public.meter_readings
  FOR DELETE TO authenticated
  USING (false);

ALTER TABLE public.utility_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_bills FORCE ROW LEVEL SECURITY;

CREATE POLICY utility_bills_select ON public.utility_bills
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR responsible_party_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.utility_accounts ua
      WHERE ua.id = utility_bills.utility_account_id AND ua.customer_id = auth.uid()
    )
    OR public.is_super_admin()
  );

CREATE POLICY utility_bills_no_direct_insert ON public.utility_bills
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY utility_bills_no_direct_update ON public.utility_bills
  FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY utility_bills_no_delete ON public.utility_bills
  FOR DELETE TO authenticated
  USING (false);

ALTER TABLE public.utility_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY utility_payments_select ON public.utility_payments
  FOR SELECT TO authenticated
  USING (
    public.can_manage_utility_ops(tenant_id)
    OR payer_id = auth.uid()
    OR public.is_super_admin()
  );

CREATE POLICY utility_payments_insert ON public.utility_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE POLICY utility_payments_update_pending_own ON public.utility_payments
  FOR UPDATE TO authenticated
  USING (payer_id = auth.uid() AND status = 'pending')
  WITH CHECK (payer_id = auth.uid() AND status = 'pending');

CREATE POLICY utility_payments_no_delete ON public.utility_payments
  FOR DELETE TO authenticated
  USING (false);

-- Landlords have NO policies on utility tables — isolation by omission.

-- ---------------------------------------------------------------------------
-- Utility payment proof storage (reuse payment-proofs bucket; path utility/...)
-- Path: utility/{tenant_id}/{bill_id}/{payment_or_uuid}.ext
-- ---------------------------------------------------------------------------
CREATE POLICY utility_payment_proofs_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'utility'
    AND (
      public.can_approve_utility((storage.foldername(name))[2]::uuid)
      OR public.can_manage_utility_ops((storage.foldername(name))[2]::uuid)
      OR EXISTS (
        SELECT 1 FROM public.utility_bills ub
        WHERE ub.id = (storage.foldername(name))[3]::uuid
          AND (
            ub.responsible_party_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.utility_accounts ua
              WHERE ua.id = ub.utility_account_id AND ua.customer_id = auth.uid()
            )
          )
      )
      OR public.is_super_admin()
    )
  );

CREATE POLICY utility_payment_proofs_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'utility'
    AND EXISTS (
      SELECT 1 FROM public.utility_bills ub
      WHERE ub.id = (storage.foldername(name))[3]::uuid
        AND ub.tenant_id = (storage.foldername(name))[2]::uuid
        AND (
          ub.responsible_party_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.utility_accounts ua
            WHERE ua.id = ub.utility_account_id AND ua.customer_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY utility_payment_proofs_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = 'utility'
    AND (
      public.can_manage_utility_ops((storage.foldername(name))[2]::uuid)
      OR EXISTS (
        SELECT 1 FROM public.utility_bills ub
        WHERE ub.id = (storage.foldername(name))[3]::uuid
          AND (
            ub.responsible_party_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.utility_accounts ua
              WHERE ua.id = ub.utility_account_id AND ua.customer_id = auth.uid()
            )
          )
      )
    )
  );
