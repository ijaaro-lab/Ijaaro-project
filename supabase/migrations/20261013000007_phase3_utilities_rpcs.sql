-- IJAARO Phase 3–4 (Prompt 03): Trusted utility RPCs
-- search_properties_for_link, create_utility_premises, link_utility_account,
-- record_meter_reading, generate_utility_bill, review_utility_payment

-- ---------------------------------------------------------------------------
-- Minimal cross-tenant property search for linking (no private landlord ops data)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_properties_for_link(
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  address_line text,
  district text,
  city text,
  name text,
  status public.property_status,
  owner_id uuid,
  current_renter_id uuid,
  landlord_tenant_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_limit int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Caller must be active utility staff/admin on some active utility tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.role IN ('utility_admin', 'utility_staff')
      AND t.status = 'active'
      AND t.tenant_type IN ('water_company', 'electricity_company')
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_q := trim(COALESCE(p_query, ''));
  IF char_length(v_q) < 2 THEN
    RAISE EXCEPTION 'search query must be at least 2 characters';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);

  RETURN QUERY
  SELECT
    p.id,
    p.address_line,
    p.district,
    p.city,
    p.name,
    p.status,
    p.owner_id,
    p.current_renter_id,
    p.tenant_id AS landlord_tenant_id
  FROM public.properties p
  WHERE
    p.address_line ILIKE '%' || v_q || '%'
    OR COALESCE(p.name, '') ILIKE '%' || v_q || '%'
    OR COALESCE(p.district, '') ILIKE '%' || v_q || '%'
    OR COALESCE(p.city, '') ILIKE '%' || v_q || '%'
  ORDER BY p.address_line
  LIMIT v_limit;
END;
$$;

-- ---------------------------------------------------------------------------
-- Path B: create premises when no IJAARO property exists
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_utility_premises(
  p_company_tenant_id uuid,
  p_address_line text,
  p_owner_id uuid,
  p_name text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_property_type public.property_type DEFAULT 'other',
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL
)
RETURNS public.properties
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_source text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_utility_ops(p_company_tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_company_tenant_id;
  IF NOT FOUND OR v_tenant.status <> 'active' THEN
    RAISE EXCEPTION 'utility tenant not found or inactive';
  END IF;

  IF v_tenant.tenant_type = 'water_company' THEN
    v_source := 'water_company';
  ELSIF v_tenant.tenant_type = 'electricity_company' THEN
    v_source := 'electricity_company';
  ELSE
    RAISE EXCEPTION 'tenant must be water or electricity company';
  END IF;

  IF NULLIF(trim(p_address_line), '') IS NULL THEN
    RAISE EXCEPTION 'address_line is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner_id) THEN
    RAISE EXCEPTION 'owner profile not found';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  -- Premises created by utility: landlord tenant_id is still required by schema.
  -- Store under a synthetic ownership of the owner's first landlord tenant if any,
  -- else attach to the creating utility tenant as created_source marker with owner_id.
  -- OQ-06: one properties table; created_source marks origin.
  INSERT INTO public.properties (
    tenant_id,
    owner_id,
    name,
    address_line,
    district,
    city,
    property_type,
    status,
    contact_phone,
    contact_email,
    created_by_tenant_id,
    created_source,
    is_listed
  ) VALUES (
    COALESCE(
      (
        SELECT tm.tenant_id
        FROM public.tenant_memberships tm
        JOIN public.tenants t ON t.id = tm.tenant_id
        WHERE tm.user_id = p_owner_id
          AND tm.status = 'active'
          AND t.tenant_type = 'landlord'
          AND t.status = 'active'
        ORDER BY tm.created_at
        LIMIT 1
      ),
      p_company_tenant_id
    ),
    p_owner_id,
    NULLIF(trim(COALESCE(p_name, '')), ''),
    trim(p_address_line),
    NULLIF(trim(COALESCE(p_district, '')), ''),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    COALESCE(p_property_type, 'other'::public.property_type),
    'vacant'::public.property_status,
    NULLIF(trim(COALESCE(p_contact_phone, '')), ''),
    NULLIF(trim(COALESCE(p_contact_email, '')), ''),
    p_company_tenant_id,
    v_source,
    false
  )
  RETURNING * INTO v_property;

  PERFORM public._insert_audit_log(
    p_company_tenant_id,
    auth.uid(),
    'utility.premises_created',
    'property',
    v_property.id,
    jsonb_build_object(
      'created_source', v_source,
      'address_line', v_property.address_line,
      'owner_id', p_owner_id
    )
  );

  RETURN v_property;
END;
$$;

-- ---------------------------------------------------------------------------
-- Link utility account (+ optional meter) to existing property
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_utility_account(
  p_company_tenant_id uuid,
  p_property_id uuid,
  p_customer_id uuid,
  p_account_number text,
  p_unit_price numeric DEFAULT 0,
  p_extra_charges_config jsonb DEFAULT '{}'::jsonb,
  p_meter_number text DEFAULT NULL,
  p_effective_from date DEFAULT NULL,
  p_ensure_customer_membership boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service public.service_type;
  v_property public.properties%ROWTYPE;
  v_account public.utility_accounts%ROWTYPE;
  v_meter public.meters%ROWTYPE;
  v_number text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_utility_ops(p_company_tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_service := public.service_type_for_tenant(p_company_tenant_id);

  SELECT * INTO v_property FROM public.properties WHERE id = p_property_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_customer_id) THEN
    RAISE EXCEPTION 'customer profile not found';
  END IF;

  v_number := trim(COALESCE(p_account_number, ''));
  IF v_number = '' THEN
    RAISE EXCEPTION 'account_number is required';
  END IF;

  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'unit_price must be >= 0';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  INSERT INTO public.utility_accounts (
    tenant_id,
    property_id,
    service_type,
    account_number,
    customer_id,
    status,
    effective_from,
    unit_price,
    extra_charges_config
  ) VALUES (
    p_company_tenant_id,
    p_property_id,
    v_service,
    v_number,
    p_customer_id,
    'active',
    COALESCE(p_effective_from, CURRENT_DATE),
    round(p_unit_price, 4),
    COALESCE(p_extra_charges_config, '{}'::jsonb)
  )
  RETURNING * INTO v_account;

  IF p_ensure_customer_membership THEN
    INSERT INTO public.tenant_memberships (tenant_id, user_id, role, status, invited_by)
    VALUES (p_company_tenant_id, p_customer_id, 'utility_customer', 'active', auth.uid())
    ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET
      role = CASE
        WHEN tenant_memberships.role IN ('utility_admin', 'utility_staff') THEN tenant_memberships.role
        ELSE 'utility_customer'::public.app_role
      END,
      status = 'active',
      updated_at = now();
  END IF;

  IF NULLIF(trim(COALESCE(p_meter_number, '')), '') IS NOT NULL THEN
    INSERT INTO public.meters (
      tenant_id,
      utility_account_id,
      meter_number,
      service_type,
      status,
      installed_at
    ) VALUES (
      p_company_tenant_id,
      v_account.id,
      trim(p_meter_number),
      v_service,
      'active',
      CURRENT_DATE
    )
    RETURNING * INTO v_meter;
  END IF;

  PERFORM public._insert_audit_log(
    p_company_tenant_id,
    auth.uid(),
    'utility.account_linked',
    'utility_account',
    v_account.id,
    jsonb_build_object(
      'property_id', p_property_id,
      'customer_id', p_customer_id,
      'account_number', v_number,
      'meter_id', v_meter.id
    )
  );

  RETURN jsonb_build_object(
    'account', to_jsonb(v_account),
    'meter', to_jsonb(v_meter)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Record meter reading with validation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_meter_reading(
  p_meter_id uuid,
  p_reading_value numeric,
  p_reading_date date DEFAULT NULL,
  p_status public.reading_status DEFAULT 'valid',
  p_correction_of_id uuid DEFAULT NULL,
  p_correction_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.meter_readings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meter public.meters%ROWTYPE;
  v_prev public.meter_readings%ROWTYPE;
  v_units numeric(14, 4);
  v_prev_val numeric(14, 4);
  v_date date;
  v_row public.meter_readings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_meter FROM public.meters WHERE id = p_meter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meter not found';
  END IF;

  IF NOT public.can_manage_utility_ops(v_meter.tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_meter.status NOT IN ('active', 'faulty') THEN
    RAISE EXCEPTION 'cannot record reading on inactive/replaced meter';
  END IF;

  IF p_reading_value IS NULL OR p_reading_value < 0 THEN
    RAISE EXCEPTION 'reading_value must be >= 0';
  END IF;

  v_date := COALESCE(p_reading_date, CURRENT_DATE);

  SELECT * INTO v_prev
  FROM public.meter_readings
  WHERE meter_id = p_meter_id
    AND status IN ('valid', 'corrected', 'reset')
    AND (reading_date < v_date OR (reading_date = v_date AND created_at < now()))
  ORDER BY reading_date DESC, created_at DESC
  LIMIT 1;

  v_prev_val := COALESCE(v_prev.reading_value, 0);

  IF p_status IN ('corrected', 'reset') THEN
    IF NULLIF(trim(COALESCE(p_correction_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'correction_reason required for corrected/reset readings';
    END IF;
  ELSIF p_reading_value < v_prev_val THEN
    RAISE EXCEPTION 'reading_value must be >= previous accepted reading (%)', v_prev_val;
  END IF;

  IF p_status = 'valid' AND p_reading_value >= v_prev_val THEN
    v_units := round(p_reading_value - v_prev_val, 4);
  ELSIF p_status IN ('corrected', 'reset') THEN
    v_units := CASE
      WHEN p_reading_value >= v_prev_val THEN round(p_reading_value - v_prev_val, 4)
      ELSE 0
    END;
  ELSE
    -- estimated / disputed: store units if non-decreasing, else null
    IF p_reading_value >= v_prev_val THEN
      v_units := round(p_reading_value - v_prev_val, 4);
    ELSE
      v_units := NULL;
    END IF;
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  INSERT INTO public.meter_readings (
    tenant_id,
    meter_id,
    utility_account_id,
    reading_value,
    previous_reading_value,
    reading_date,
    units_consumed,
    status,
    recorded_by,
    correction_of_id,
    correction_reason,
    notes
  ) VALUES (
    v_meter.tenant_id,
    v_meter.id,
    v_meter.utility_account_id,
    round(p_reading_value, 4),
    v_prev_val,
    v_date,
    v_units,
    COALESCE(p_status, 'valid'::public.reading_status),
    auth.uid(),
    p_correction_of_id,
    NULLIF(trim(COALESCE(p_correction_reason, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING * INTO v_row;

  PERFORM public._insert_audit_log(
    v_meter.tenant_id,
    auth.uid(),
    'utility.reading_recorded',
    'meter_reading',
    v_row.id,
    jsonb_build_object(
      'meter_id', p_meter_id,
      'reading_value', v_row.reading_value,
      'units_consumed', v_row.units_consumed,
      'status', v_row.status
    )
  );

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Generate utility bill from an accepted reading
-- Formula: units = current − previous; total = (units × unit_price) + extra_charges
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_utility_bill(
  p_meter_reading_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL
)
RETURNS public.utility_bills
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reading public.meter_readings%ROWTYPE;
  v_account public.utility_accounts%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_prev numeric(14, 4);
  v_units numeric(14, 4);
  v_price numeric(12, 4);
  v_extra numeric(12, 2);
  v_total numeric(12, 2);
  v_due date;
  v_resp uuid;
  v_role text;
  v_bill public.utility_bills%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reading FROM public.meter_readings WHERE id = p_meter_reading_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'meter reading not found';
  END IF;

  IF NOT public.can_manage_utility_ops(v_reading.tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_reading.status NOT IN ('valid', 'corrected', 'reset') THEN
    RAISE EXCEPTION 'only valid/corrected/reset readings can generate bills';
  END IF;

  IF v_reading.units_consumed IS NULL OR v_reading.units_consumed < 0 THEN
    RAISE EXCEPTION 'reading has invalid consumption';
  END IF;

  SELECT * INTO v_account FROM public.utility_accounts WHERE id = v_reading.utility_account_id;
  IF NOT FOUND OR v_account.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'utility account not billable';
  END IF;

  SELECT * INTO v_property FROM public.properties WHERE id = v_account.property_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'property not found';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid billing period';
  END IF;

  v_prev := COALESCE(v_reading.previous_reading_value, 0);
  v_units := round(v_reading.reading_value - v_prev, 4);
  IF v_units < 0 THEN
    RAISE EXCEPTION 'negative consumption cannot be billed';
  END IF;

  -- Snapshot unit price from account unless explicit override at generation time
  v_price := round(COALESCE(p_unit_price, v_account.unit_price), 4);
  IF v_price < 0 THEN
    RAISE EXCEPTION 'unit_price must be >= 0';
  END IF;

  v_extra := public.compute_extra_charges(v_account.extra_charges_config);
  v_total := round((v_units * v_price) + v_extra, 2);
  v_due := COALESCE(p_due_date, (p_period_end + 14));

  -- Responsibility snapshot (BR-006 / FR-024): current renter if occupied, else owner
  IF v_property.current_renter_id IS NOT NULL THEN
    v_resp := v_property.current_renter_id;
    v_role := 'renter';
  ELSE
    v_resp := v_property.owner_id;
    v_role := 'owner';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  INSERT INTO public.utility_bills (
    tenant_id,
    utility_account_id,
    property_id,
    meter_reading_id,
    service_type,
    period_start,
    period_end,
    previous_reading,
    current_reading,
    units_consumed,
    unit_price,
    extra_charges,
    total_amount,
    amount_paid,
    balance,
    due_date,
    status,
    responsible_party_id,
    responsible_party_role,
    occupancy_snapshot
  ) VALUES (
    v_account.tenant_id,
    v_account.id,
    v_account.property_id,
    v_reading.id,
    v_account.service_type,
    p_period_start,
    p_period_end,
    v_prev,
    v_reading.reading_value,
    v_units,
    v_price,
    v_extra,
    v_total,
    0,
    v_total,
    v_due,
    CASE
      WHEN v_due < CURRENT_DATE THEN 'overdue'::public.bill_status
      ELSE 'issued'::public.bill_status
    END,
    v_resp,
    v_role,
    jsonb_build_object(
      'property_id', v_property.id,
      'owner_id', v_property.owner_id,
      'current_renter_id', v_property.current_renter_id,
      'property_status', v_property.status,
      'customer_id', v_account.customer_id,
      'account_unit_price_at_generation', v_account.unit_price,
      'snapshot_at', now()
    )
  )
  RETURNING * INTO v_bill;

  PERFORM public._insert_audit_log(
    v_bill.tenant_id,
    auth.uid(),
    'utility.bill_generated',
    'utility_bill',
    v_bill.id,
    jsonb_build_object(
      'utility_account_id', v_account.id,
      'units_consumed', v_units,
      'unit_price', v_price,
      'extra_charges', v_extra,
      'total_amount', v_total,
      'responsible_party_id', v_resp,
      'responsible_party_role', v_role
    )
  );

  RETURN v_bill;
END;
$$;

-- ---------------------------------------------------------------------------
-- Review utility payment — company only (NOT landlord)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_utility_payment(
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
  v_payment public.utility_payments%ROWTYPE;
  v_bill public.utility_bills%ROWTYPE;
  v_decision text;
  v_new_paid numeric(12, 2);
  v_new_balance numeric(12, 2);
  v_new_status public.bill_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_decision := lower(trim(p_decision));
  IF v_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject';
  END IF;

  SELECT * INTO v_payment
  FROM public.utility_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  -- Explicitly company-only; landlords never pass this check for utility tenants
  IF NOT public.can_approve_utility(v_payment.tenant_id) THEN
    RAISE EXCEPTION 'not authorized to review utility payments' USING ERRCODE = '42501';
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment is not pending (already reviewed or closed)';
  END IF;

  SELECT * INTO v_bill
  FROM public.utility_bills
  WHERE id = v_payment.utility_bill_id
  FOR UPDATE;

  PERFORM set_config('ijaaro.internal', '1', true);

  IF v_decision = 'reject' THEN
    UPDATE public.utility_payments
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
      'utility.payment_rejected',
      'utility_payment',
      v_payment.id,
      jsonb_build_object(
        'utility_bill_id', v_bill.id,
        'amount', v_payment.amount,
        'rejection_reason', v_payment.rejection_reason
      )
    );

    RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'bill', to_jsonb(v_bill));
  END IF;

  IF v_payment.amount > v_bill.balance THEN
    RAISE EXCEPTION 'approved amount would exceed outstanding balance';
  END IF;

  v_new_paid := round(v_bill.amount_paid + v_payment.amount, 2);
  v_new_balance := round(v_bill.total_amount - v_new_paid, 2);

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'balance would become negative';
  END IF;

  IF v_new_balance = 0 THEN
    v_new_status := 'paid';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'partial';
  ELSIF v_bill.due_date < CURRENT_DATE THEN
    v_new_status := 'overdue';
  ELSE
    v_new_status := 'issued';
  END IF;

  UPDATE public.utility_payments
  SET
    status = 'paid',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  UPDATE public.utility_bills
  SET
    amount_paid = v_new_paid,
    balance = v_new_balance,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_bill.id
  RETURNING * INTO v_bill;

  PERFORM public._insert_audit_log(
    v_payment.tenant_id,
    auth.uid(),
    'utility.payment_approved',
    'utility_payment',
    v_payment.id,
    jsonb_build_object(
      'utility_bill_id', v_bill.id,
      'amount', v_payment.amount,
      'bill_balance', v_bill.balance,
      'bill_status', v_bill.status
    )
  );

  RETURN jsonb_build_object('payment', to_jsonb(v_payment), 'bill', to_jsonb(v_bill));
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.search_properties_for_link(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_utility_premises(uuid, text, uuid, text, text, text, public.property_type, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_utility_account(uuid, uuid, uuid, text, numeric, jsonb, text, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_meter_reading(uuid, numeric, date, public.reading_status, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_utility_bill(uuid, date, date, date, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_utility_payment(uuid, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.search_properties_for_link(text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.create_utility_premises(uuid, text, uuid, text, text, text, public.property_type, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.link_utility_account(uuid, uuid, uuid, text, numeric, jsonb, text, date, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.record_meter_reading(uuid, numeric, date, public.reading_status, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.generate_utility_bill(uuid, date, date, date, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.review_utility_payment(uuid, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.search_properties_for_link(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_utility_premises(uuid, text, uuid, text, text, text, public.property_type, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_utility_account(uuid, uuid, uuid, text, numeric, jsonb, text, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_meter_reading(uuid, numeric, date, public.reading_status, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_utility_bill(uuid, date, date, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_utility_payment(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.enforce_utility_account_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_meter_account_chain() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_utility_bill_financials() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_utility_payment_submit() FROM PUBLIC, anon, authenticated;
