-- IJAARO Phase 2 (Prompt 02 rent scope): rent_charges, rent_payments, review RPCs, proof storage
-- Roadmap labels this Phase 3; Prompt 02 requires the manual rent workflow with properties/tenancy.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.charge_status AS ENUM ('due', 'partial', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.payment_status AS ENUM (
  'pending', 'processing', 'paid', 'rejected', 'failed', 'cancelled', 'refunded'
);
CREATE TYPE public.payment_method AS ENUM (
  'cash', 'bank_transfer', 'mobile_money', 'card', 'other', 'api_provider'
);

-- ---------------------------------------------------------------------------
-- rent_charges
-- ---------------------------------------------------------------------------
CREATE TABLE public.rent_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.rental_assignments (id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  renter_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  amount_due numeric(12, 2) NOT NULL,
  amount_paid numeric(12, 2) NOT NULL DEFAULT 0,
  balance numeric(12, 2) NOT NULL,
  status public.charge_status NOT NULL DEFAULT 'due',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rent_charges_amounts_nonneg CHECK (
    amount_due >= 0 AND amount_paid >= 0 AND balance >= 0
  ),
  CONSTRAINT rent_charges_period CHECK (period_end >= period_start),
  CONSTRAINT rent_charges_balance_math CHECK (
    balance = round(amount_due - amount_paid, 2)
  )
);

CREATE INDEX idx_rent_charges_tenant_status ON public.rent_charges (tenant_id, status);
CREATE INDEX idx_rent_charges_assignment ON public.rent_charges (assignment_id, due_date);
CREATE INDEX idx_rent_charges_renter ON public.rent_charges (renter_id, status);
CREATE INDEX idx_rent_charges_property ON public.rent_charges (property_id, due_date);
CREATE UNIQUE INDEX uq_rent_charges_assignment_period
  ON public.rent_charges (assignment_id, period_start, period_end);

CREATE TRIGGER rent_charges_set_updated_at
  BEFORE UPDATE ON public.rent_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.protect_rent_charge_financials()
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
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'charge financial fields may only change via payment review workflows'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.property_id IS DISTINCT FROM OLD.property_id
       OR NEW.renter_id IS DISTINCT FROM OLD.renter_id THEN
      RAISE EXCEPTION 'charge identity fields are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rent_charges_protect_financials
  BEFORE UPDATE ON public.rent_charges
  FOR EACH ROW EXECUTE FUNCTION public.protect_rent_charge_financials();

-- ---------------------------------------------------------------------------
-- rent_payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.rent_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  rent_charge_id uuid NOT NULL REFERENCES public.rent_charges (id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties (id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.rental_assignments (id) ON DELETE RESTRICT,
  payer_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
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
  CONSTRAINT rent_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT rent_payments_currency_len CHECK (char_length(currency) BETWEEN 3 AND 8),
  CONSTRAINT rent_payments_review_consistency CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('paid', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status IN ('processing', 'failed', 'cancelled', 'refunded'))
  )
);

CREATE INDEX idx_rent_payments_tenant_status ON public.rent_payments (tenant_id, status);
CREATE INDEX idx_rent_payments_charge ON public.rent_payments (rent_charge_id, status);
CREATE INDEX idx_rent_payments_payer ON public.rent_payments (payer_id, status);
CREATE INDEX idx_rent_payments_assignment ON public.rent_payments (assignment_id, submitted_at DESC);

CREATE UNIQUE INDEX uq_rent_payments_provider_txn
  ON public.rent_payments (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX uq_rent_payments_idempotency
  ON public.rent_payments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- One open pending submission per charge+payer (rejected history retained; can resubmit)
CREATE UNIQUE INDEX uq_rent_payments_one_pending
  ON public.rent_payments (rent_charge_id, payer_id)
  WHERE status = 'pending';

CREATE TRIGGER rent_payments_set_updated_at
  BEFORE UPDATE ON public.rent_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_rent_payment_submit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_charge public.rent_charges%ROWTYPE;
BEGIN
  IF current_setting('ijaaro.internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_charge FROM public.rent_charges WHERE id = NEW.rent_charge_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'rent charge not found';
    END IF;

    NEW.tenant_id := v_charge.tenant_id;
    NEW.property_id := v_charge.property_id;
    NEW.assignment_id := v_charge.assignment_id;
    NEW.payer_id := auth.uid();
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.submitted_at := now();

    IF NEW.payer_id IS DISTINCT FROM v_charge.renter_id THEN
      RAISE EXCEPTION 'payer must be the charge renter' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_assignment_renter(v_charge.assignment_id) THEN
      RAISE EXCEPTION 'not authorized to pay this charge' USING ERRCODE = '42501';
    END IF;

    IF v_charge.status = 'cancelled' THEN
      RAISE EXCEPTION 'cannot pay a cancelled charge';
    END IF;

    IF NEW.amount > v_charge.balance THEN
      RAISE EXCEPTION 'payment amount exceeds outstanding balance';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Renters cannot change status/review fields; landlords use review RPC
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.payer_id IS DISTINCT FROM OLD.payer_id
       OR NEW.rent_charge_id IS DISTINCT FROM OLD.rent_charge_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'payment review fields are immutable except via review_rent_payment'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rent_payments_enforce_submit
  BEFORE INSERT OR UPDATE ON public.rent_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_rent_payment_submit();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.rent_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_charges FORCE ROW LEVEL SECURITY;

CREATE POLICY rent_charges_select ON public.rent_charges
  FOR SELECT TO authenticated
  USING (
    public.can_manage_landlord_ops(tenant_id)
    OR renter_id = auth.uid()
    OR public.is_super_admin()
  );

CREATE POLICY rent_charges_insert ON public.rent_charges
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_landlord_ops(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.rental_assignments ra
      WHERE ra.id = assignment_id
        AND ra.tenant_id = rent_charges.tenant_id
        AND ra.property_id = rent_charges.property_id
        AND ra.renter_id = rent_charges.renter_id
        AND ra.status = 'active'
    )
    AND amount_paid = 0
    AND balance = amount_due
    AND status IN ('due', 'overdue')
  );

CREATE POLICY rent_charges_update ON public.rent_charges
  FOR UPDATE TO authenticated
  USING (public.can_manage_landlord_ops(tenant_id))
  WITH CHECK (public.can_manage_landlord_ops(tenant_id));

CREATE POLICY rent_charges_no_delete ON public.rent_charges
  FOR DELETE TO authenticated
  USING (false);

ALTER TABLE public.rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY rent_payments_select ON public.rent_payments
  FOR SELECT TO authenticated
  USING (
    public.can_manage_landlord_ops(tenant_id)
    OR payer_id = auth.uid()
    OR public.is_super_admin()
  );

CREATE POLICY rent_payments_insert ON public.rent_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND public.is_assignment_renter(assignment_id)
  );

-- No direct client updates that change review outcome; trigger blocks review fields.
-- Allow payer to update optional proof/reference while pending only.
CREATE POLICY rent_payments_update_pending_own ON public.rent_payments
  FOR UPDATE TO authenticated
  USING (payer_id = auth.uid() AND status = 'pending')
  WITH CHECK (payer_id = auth.uid() AND status = 'pending');

CREATE POLICY rent_payments_no_delete ON public.rent_payments
  FOR DELETE TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- Payment proof storage
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Path: {tenant_id}/{assignment_id}/{payment_or_uuid}.ext
CREATE POLICY payment_proofs_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      public.can_approve_rent((storage.foldername(name))[1]::uuid)
      OR public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
      OR public.is_assignment_renter((storage.foldername(name))[2]::uuid)
      OR public.is_super_admin()
    )
  );

CREATE POLICY payment_proofs_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND public.is_assignment_renter((storage.foldername(name))[2]::uuid)
    AND EXISTS (
      SELECT 1 FROM public.rental_assignments ra
      WHERE ra.id = (storage.foldername(name))[2]::uuid
        AND ra.tenant_id = (storage.foldername(name))[1]::uuid
        AND ra.renter_id = auth.uid()
    )
  );

CREATE POLICY payment_proofs_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      public.is_assignment_renter((storage.foldername(name))[2]::uuid)
      OR public.can_manage_landlord_ops((storage.foldername(name))[1]::uuid)
    )
  );

-- ---------------------------------------------------------------------------
-- create_rent_charge RPC (trusted insert with consistent balance)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_rent_charge(
  p_assignment_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date,
  p_amount_due numeric DEFAULT NULL
)
RETURNS public.rent_charges
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.rental_assignments%ROWTYPE;
  v_charge public.rent_charges%ROWTYPE;
  v_amount numeric(12, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_assignment FROM public.rental_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;

  IF NOT public.can_manage_landlord_ops(v_assignment.tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_assignment.status <> 'active' THEN
    RAISE EXCEPTION 'charges can only be created for active assignments';
  END IF;

  v_amount := COALESCE(p_amount_due, v_assignment.rent_amount);
  IF v_amount IS NULL OR v_amount < 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid period';
  END IF;

  INSERT INTO public.rent_charges (
    tenant_id, assignment_id, property_id, renter_id,
    period_start, period_end, due_date,
    amount_due, amount_paid, balance, status
  ) VALUES (
    v_assignment.tenant_id,
    v_assignment.id,
    v_assignment.property_id,
    v_assignment.renter_id,
    p_period_start,
    p_period_end,
    p_due_date,
    v_amount,
    0,
    v_amount,
    CASE WHEN p_due_date < CURRENT_DATE THEN 'overdue'::public.charge_status ELSE 'due'::public.charge_status END
  )
  RETURNING * INTO v_charge;

  PERFORM public._insert_audit_log(
    v_charge.tenant_id,
    auth.uid(),
    'rent.charge_created',
    'rent_charge',
    v_charge.id,
    jsonb_build_object('assignment_id', p_assignment_id, 'amount_due', v_amount)
  );

  RETURN v_charge;
END;
$$;

-- ---------------------------------------------------------------------------
-- review_rent_payment (approve / reject) — concurrent-safe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_rent_payment(
  p_payment_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.rent_payments%ROWTYPE;
  v_charge public.rent_charges%ROWTYPE;
  v_decision text;
  v_new_paid numeric(12, 2);
  v_new_balance numeric(12, 2);
  v_new_status public.charge_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_decision := lower(trim(p_decision));
  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;

  SELECT * INTO v_payment
  FROM public.rent_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  IF NOT public.can_approve_rent(v_payment.tenant_id) THEN
    RAISE EXCEPTION 'not authorized to review rent payments' USING ERRCODE = '42501';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment is not pending (already reviewed or closed)';
  END IF;

  SELECT * INTO v_charge
  FROM public.rent_charges
  WHERE id = v_payment.rent_charge_id
  FOR UPDATE;

  PERFORM set_config('ijaaro.internal', '1', true);

  IF v_decision = 'reject' THEN
    UPDATE public.rent_payments
    SET
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = NULLIF(trim(COALESCE(p_rejection_reason, '')), ''),
      updated_at = now()
    WHERE id = v_payment.id
    RETURNING * INTO v_payment;

    PERFORM public._insert_audit_log(
      v_payment.tenant_id,
      auth.uid(),
      'rent.payment_rejected',
      'rent_payment',
      v_payment.id,
      jsonb_build_object(
        'rent_charge_id', v_charge.id,
        'amount', v_payment.amount,
        'rejection_reason', v_payment.rejection_reason
      )
    );

    RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'charge', to_jsonb(v_charge));
  END IF;

  -- approve
  IF v_payment.amount > v_charge.balance THEN
    RAISE EXCEPTION 'approved amount would exceed outstanding balance';
  END IF;

  v_new_paid := round(v_charge.amount_paid + v_payment.amount, 2);
  v_new_balance := round(v_charge.amount_due - v_new_paid, 2);

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'balance would become negative';
  END IF;

  IF v_new_balance = 0 THEN
    v_new_status := 'paid';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'partial';
  ELSIF v_charge.due_date < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
    v_new_status := 'due';
  END IF;

  UPDATE public.rent_payments
  SET
    status = 'paid',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  UPDATE public.rent_charges
  SET
    amount_paid = v_new_paid,
    balance = v_new_balance,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_charge.id
  RETURNING * INTO v_charge;

  PERFORM public._insert_audit_log(
    v_payment.tenant_id,
    auth.uid(),
    'rent.payment_approved',
    'rent_payment',
    v_payment.id,
    jsonb_build_object(
      'rent_charge_id', v_charge.id,
      'amount', v_payment.amount,
      'charge_balance', v_charge.balance,
      'charge_status', v_charge.status
    )
  );

  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'charge', to_jsonb(v_charge));
END;
$$;

-- ---------------------------------------------------------------------------
-- Upgrade assign_renter to optionally create the first rent charge
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
  v_period_end date;
  v_due date;
  v_charge_id uuid;
  v_day int;
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

  IF p_create_initial_charge THEN
    v_period_end := (date_trunc('month', v_assignment.start_date::timestamp) + interval '1 month - 1 day')::date;
    v_day := LEAST(
      COALESCE(v_assignment.due_day, EXTRACT(DAY FROM v_assignment.start_date)::int),
      28
    );
    v_due := make_date(
      EXTRACT(YEAR FROM v_assignment.start_date)::int,
      EXTRACT(MONTH FROM v_assignment.start_date)::int,
      v_day
    );
    IF v_due < v_assignment.start_date THEN
      v_due := (v_due + interval '1 month')::date;
    END IF;

    INSERT INTO public.rent_charges (
      tenant_id, assignment_id, property_id, renter_id,
      period_start, period_end, due_date,
      amount_due, amount_paid, balance, status
    ) VALUES (
      v_assignment.tenant_id,
      v_assignment.id,
      v_assignment.property_id,
      v_assignment.renter_id,
      v_assignment.start_date,
      v_period_end,
      v_due,
      v_assignment.rent_amount,
      0,
      v_assignment.rent_amount,
      CASE WHEN v_due < CURRENT_DATE THEN 'overdue'::public.charge_status ELSE 'due'::public.charge_status END
    )
    RETURNING id INTO v_charge_id;
  END IF;

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
      'initial_charge_id', v_charge_id
    )
  );

  RETURN jsonb_build_object(
    'assignment', to_jsonb(v_assignment),
    'initial_charge_id', v_charge_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_rent_charge(uuid, date, date, date, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_rent_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_rent_charge(uuid, date, date, date, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.review_rent_payment(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_rent_charge(uuid, date, date, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_rent_payment(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.protect_rent_charge_financials() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_rent_payment_submit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_rent_charge_financials() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_rent_payment_submit() FROM anon, authenticated;
