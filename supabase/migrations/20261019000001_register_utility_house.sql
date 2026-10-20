-- Water/electricity company: register a house + account with monthly fee,
-- and issue flat monthly bills without a meter reading.
-- UI speaks "house"; under the hood still uses properties + utility_accounts.

-- ---------------------------------------------------------------------------
-- Flat bills may omit meter_reading_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.utility_bills
  ALTER COLUMN meter_reading_id DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Allow company admins (not only super admin) to look up profiles by email
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_profile_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id = auth.uid()
        AND tm.status = 'active'
        AND tm.role IN ('utility_admin', 'landlord_admin')
        AND t.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.phone
  FROM public.profiles p
  WHERE lower(btrim(p.email)) = lower(btrim(p_email))
  LIMIT 5;
END;
$$;

-- ---------------------------------------------------------------------------
-- register_utility_house: premises + account (+ optional meter) in one call
-- ---------------------------------------------------------------------------
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

  -- Customer: optional email lookup; else admin is placeholder customer until reassigned
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
    'monthly_amount', round(p_monthly_amount, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_utility_house(
  uuid, text, text, numeric, text, text, text, text, text, text, text, public.property_type
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_utility_house(
  uuid, text, text, numeric, text, text, text, text, text, text, text, public.property_type
) FROM anon;
GRANT EXECUTE ON FUNCTION public.register_utility_house(
  uuid, text, text, numeric, text, text, text, text, text, text, text, public.property_type
) TO authenticated;

-- ---------------------------------------------------------------------------
-- generate_flat_utility_bill: monthly fee from extra_charges_config
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_flat_utility_bill(
  p_utility_account_id uuid,
  p_period_start date,
  p_period_end date,
  p_due_date date DEFAULT NULL
)
RETURNS public.utility_bills
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.utility_accounts%ROWTYPE;
  v_property public.properties%ROWTYPE;
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

  SELECT * INTO v_account FROM public.utility_accounts WHERE id = p_utility_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility account not found';
  END IF;

  IF NOT public.can_manage_utility_ops(v_account.tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_account.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'utility account not billable';
  END IF;

  SELECT * INTO v_property FROM public.properties WHERE id = v_account.property_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'house not found';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'invalid billing period';
  END IF;

  v_extra := public.compute_extra_charges(v_account.extra_charges_config);
  IF v_extra <= 0 THEN
    RAISE EXCEPTION 'monthly fee is not set on this house (extra_charges_config.fixed_amount)';
  END IF;

  v_total := v_extra;
  v_due := COALESCE(p_due_date, (p_period_end + 14));

  -- Prefer linked customer; else property owner
  IF v_account.customer_id IS NOT NULL THEN
    v_resp := v_account.customer_id;
    v_role := 'customer';
  ELSIF v_property.current_renter_id IS NOT NULL THEN
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
    NULL,
    v_account.service_type,
    p_period_start,
    p_period_end,
    0,
    0,
    0,
    0,
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
      'billing_mode', 'flat_monthly',
      'house_id', v_property.id,
      'address_line', v_property.address_line,
      'customer_id', v_account.customer_id,
      'monthly_amount', v_extra,
      'snapshot_at', now()
    )
  )
  RETURNING * INTO v_bill;

  PERFORM public._insert_audit_log(
    v_bill.tenant_id,
    auth.uid(),
    'utility.flat_bill_generated',
    'utility_bill',
    v_bill.id,
    jsonb_build_object(
      'utility_account_id', v_account.id,
      'total_amount', v_total,
      'period_start', p_period_start,
      'period_end', p_period_end
    )
  );

  RETURN v_bill;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_flat_utility_bill(uuid, date, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_flat_utility_bill(uuid, date, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_flat_utility_bill(uuid, date, date, date) TO authenticated;
