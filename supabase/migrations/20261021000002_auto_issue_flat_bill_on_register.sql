-- When a water/electricity house is registered with a monthly fee, issue the
-- current calendar-month bill immediately so the customer can see what they owe
-- and submit payment for approval.

CREATE OR REPLACE FUNCTION public.register_utility_house(
  p_company_tenant_id uuid,
  p_address_line text,
  p_account_number text,
  p_monthly_amount numeric,
  p_name text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_customer_email text DEFAULT NULL,
  p_meter_number text DEFAULT NULL,
  p_property_type public.property_type DEFAULT 'house'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_source text;
  v_owner uuid;
  v_customer uuid;
  v_ensure_membership boolean;
  v_property public.properties%ROWTYPE;
  v_link jsonb;
  v_account public.utility_accounts%ROWTYPE;
  v_bill public.utility_bills%ROWTYPE;
  v_period_start date;
  v_period_end date;
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

  IF NULLIF(trim(COALESCE(p_account_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'account_number is required';
  END IF;

  IF p_monthly_amount IS NULL OR p_monthly_amount < 0 THEN
    RAISE EXCEPTION 'monthly_amount must be >= 0';
  END IF;

  v_customer := auth.uid();
  v_owner := auth.uid();
  v_ensure_membership := false;

  IF NULLIF(trim(COALESCE(p_customer_email, '')), '') IS NOT NULL THEN
    SELECT p.id INTO v_customer
    FROM public.profiles p
    WHERE lower(btrim(p.email)) = lower(btrim(p_customer_email))
    LIMIT 1;

    IF v_customer IS NULL THEN
      RAISE EXCEPTION 'customer email not found — they must have an account first';
    END IF;

    v_owner := v_customer;
    v_ensure_membership := true;
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

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
    p_company_tenant_id,
    v_owner,
    NULLIF(trim(COALESCE(p_name, '')), ''),
    trim(p_address_line),
    NULLIF(trim(COALESCE(p_district, '')), ''),
    NULLIF(trim(COALESCE(p_city, '')), ''),
    COALESCE(p_property_type, 'house'::public.property_type),
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
    'utility.house_registered',
    'property',
    v_property.id,
    jsonb_build_object(
      'address_line', v_property.address_line,
      'monthly_amount', round(p_monthly_amount, 2),
      'account_number', trim(p_account_number)
    )
  );

  v_link := public.link_utility_account(
    p_company_tenant_id,
    v_property.id,
    v_customer,
    trim(p_account_number),
    0,
    jsonb_build_object('fixed_amount', round(p_monthly_amount, 2)),
    NULLIF(trim(COALESCE(p_meter_number, '')), ''),
    CURRENT_DATE,
    v_ensure_membership
  );

  SELECT * INTO v_account
  FROM public.utility_accounts
  WHERE id = (v_link->'account'->>'id')::uuid;

  -- Issue this month's bill so the customer can see the amount owed.
  IF round(p_monthly_amount, 2) > 0 THEN
    v_period_start := date_trunc('month', CURRENT_DATE)::date;
    v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
    v_bill := public.generate_flat_utility_bill(
      v_account.id,
      v_period_start,
      v_period_end,
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'house', jsonb_build_object(
      'id', v_property.id,
      'name', v_property.name,
      'address_line', v_property.address_line,
      'district', v_property.district,
      'city', v_property.city,
      'contact_phone', v_property.contact_phone,
      'contact_email', v_property.contact_email,
      'property_type', v_property.property_type,
      'status', v_property.status
    ),
    'account', to_jsonb(v_account),
    'meter', v_link->'meter',
    'monthly_amount', round(p_monthly_amount, 2),
    'bill', CASE WHEN v_bill.id IS NOT NULL THEN to_jsonb(v_bill) ELSE NULL END
  );
END;
$$;

-- Backfill: water accounts with a monthly fee but no open bill get this month's bill.
DO $$
DECLARE
  r record;
  v_start date := date_trunc('month', CURRENT_DATE)::date;
  v_end date := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
  v_fee numeric(12, 2);
  v_resp uuid;
  v_role text;
  v_prop public.properties%ROWTYPE;
BEGIN
  PERFORM set_config('ijaaro.internal', '1', true);

  FOR r IN
    SELECT ua.*
    FROM public.utility_accounts ua
    JOIN public.tenants t ON t.id = ua.tenant_id
    WHERE t.tenant_type IN ('water_company', 'electricity_company')
      AND ua.status IN ('active', 'suspended')
      AND COALESCE((ua.extra_charges_config->>'fixed_amount')::numeric, 0) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.utility_bills ub
        WHERE ub.utility_account_id = ua.id
          AND ub.balance > 0
          AND ub.status <> 'cancelled'
      )
  LOOP
    v_fee := round(COALESCE((r.extra_charges_config->>'fixed_amount')::numeric, 0), 2);
    IF v_fee <= 0 THEN
      CONTINUE;
    END IF;

    -- Skip if this month's bill already exists (even if paid/zero).
    IF EXISTS (
      SELECT 1 FROM public.utility_bills ub
      WHERE ub.utility_account_id = r.id
        AND ub.period_start = v_start
        AND ub.period_end = v_end
        AND ub.status <> 'cancelled'
    ) THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_prop FROM public.properties WHERE id = r.property_id;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF r.customer_id IS NOT NULL THEN
      v_resp := r.customer_id;
      v_role := 'customer';
    ELSIF v_prop.current_renter_id IS NOT NULL THEN
      v_resp := v_prop.current_renter_id;
      v_role := 'renter';
    ELSE
      v_resp := v_prop.owner_id;
      v_role := 'owner';
    END IF;

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
      r.tenant_id,
      r.id,
      r.property_id,
      NULL,
      r.service_type,
      v_start,
      v_end,
      0,
      0,
      0,
      0,
      v_fee,
      v_fee,
      0,
      v_fee,
      (v_end + 14),
      'issued',
      v_resp,
      v_role,
      jsonb_build_object(
        'billing_mode', 'flat_monthly',
        'monthly_amount', v_fee,
        'backfilled', true,
        'snapshot_at', now()
      )
    );
  END LOOP;
END;
$$;
