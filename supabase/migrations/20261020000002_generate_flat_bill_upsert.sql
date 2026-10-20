-- Return existing bill for the same account+period instead of failing on
-- uq_utility_bills_account_period_active (needed for silent pay-record flow).

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

  -- Idempotent: reuse non-cancelled bill for this period.
  SELECT * INTO v_bill
  FROM public.utility_bills
  WHERE utility_account_id = p_utility_account_id
    AND period_start = p_period_start
    AND period_end = p_period_end
    AND status <> 'cancelled'::public.bill_status
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_bill;
  END IF;

  v_extra := public.compute_extra_charges(v_account.extra_charges_config);
  IF v_extra <= 0 THEN
    RAISE EXCEPTION 'monthly fee is not set on this house (extra_charges_config.fixed_amount)';
  END IF;

  v_total := v_extra;
  v_due := COALESCE(p_due_date, (p_period_end + 14));

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
