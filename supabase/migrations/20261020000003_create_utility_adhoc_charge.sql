-- Create a one-off charge (other fee) for a utility account — increases balance.
-- Used by water company "Charge Balance" (non-monthly-fee charges).

CREATE OR REPLACE FUNCTION public.create_utility_adhoc_charge(
  p_utility_account_id uuid,
  p_amount numeric,
  p_description text DEFAULT NULL,
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
  v_amount numeric(12, 2);
  v_due date;
  v_resp uuid;
  v_role text;
  v_bill public.utility_bills%ROWTYPE;
  v_day date := CURRENT_DATE;
  v_period_end date;
  v_desc text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_amount := round(p_amount::numeric, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'charge amount must be greater than zero';
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

  v_due := COALESCE(p_due_date, (v_day + 14));
  v_desc := NULLIF(trim(COALESCE(p_description, '')), '');
  IF v_desc IS NULL THEN
    v_desc := 'Other charge';
  END IF;

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

  -- Pick a free (period_start, period_end) so multiple other fees can exist same day
  -- under uq_utility_bills_account_period_active.
  v_period_end := v_day;
  WHILE EXISTS (
    SELECT 1
    FROM public.utility_bills b
    WHERE b.utility_account_id = v_account.id
      AND b.period_start = v_day
      AND b.period_end = v_period_end
      AND b.status <> 'cancelled'::public.bill_status
  ) LOOP
    v_period_end := v_period_end + 1;
  END LOOP;

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
    v_day,
    v_period_end,
    0,
    0,
    0,
    0,
    v_amount,
    v_amount,
    0,
    v_amount,
    v_due,
    CASE
      WHEN v_due < CURRENT_DATE THEN 'overdue'::public.bill_status
      ELSE 'issued'::public.bill_status
    END,
    v_resp,
    v_role,
    jsonb_build_object(
      'billing_mode', 'adhoc_charge',
      'description', v_desc,
      'house_id', v_property.id,
      'address_line', v_property.address_line,
      'customer_id', v_account.customer_id,
      'created_by', auth.uid(),
      'snapshot_at', now()
    )
  )
  RETURNING * INTO v_bill;

  PERFORM public._insert_audit_log(
    v_bill.tenant_id,
    auth.uid(),
    'utility.adhoc_charge_created',
    'utility_bill',
    v_bill.id,
    jsonb_build_object(
      'utility_account_id', v_account.id,
      'amount', v_amount,
      'description', v_desc
    )
  );

  RETURN v_bill;
END;
$$;

REVOKE ALL ON FUNCTION public.create_utility_adhoc_charge(uuid, numeric, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_utility_adhoc_charge(uuid, numeric, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_utility_adhoc_charge(uuid, numeric, text, date) TO authenticated;
