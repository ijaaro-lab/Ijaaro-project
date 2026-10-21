-- Issue several consecutive monthly flat bills for one utility account
-- in one call (e.g. 5 or 20 months ahead) using the saved monthly fee.

CREATE OR REPLACE FUNCTION public.issue_flat_bills_months_ahead(
  p_utility_account_id uuid,
  p_months integer,
  p_from_period_start date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.utility_accounts%ROWTYPE;
  v_fee numeric(12, 2);
  v_months int;
  v_cursor date;
  v_start date;
  v_end date;
  v_bill public.utility_bills%ROWTYPE;
  v_latest date;
  v_issued int := 0;
  v_reused int := 0;
  v_i int;
  v_existed boolean;
  v_periods jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_months := COALESCE(p_months, 0);
  IF v_months < 1 OR v_months > 36 THEN
    RAISE EXCEPTION 'months must be between 1 and 36';
  END IF;

  SELECT * INTO v_account
  FROM public.utility_accounts
  WHERE id = p_utility_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility account not found';
  END IF;

  IF NOT public.can_manage_utility_ops(v_account.tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_account.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'utility account not billable';
  END IF;

  v_fee := round(COALESCE((v_account.extra_charges_config->>'fixed_amount')::numeric, 0), 2);
  IF v_fee <= 0 THEN
    RAISE EXCEPTION 'monthly fee is not set on this account';
  END IF;

  IF p_from_period_start IS NOT NULL THEN
    v_cursor := date_trunc('month', p_from_period_start)::date;
  ELSE
    SELECT max(ub.period_start) INTO v_latest
    FROM public.utility_bills ub
    WHERE ub.utility_account_id = v_account.id
      AND ub.status <> 'cancelled';

    IF v_latest IS NULL THEN
      v_cursor := date_trunc('month', CURRENT_DATE)::date;
    ELSE
      v_cursor := (date_trunc('month', v_latest) + interval '1 month')::date;
    END IF;
  END IF;

  FOR v_i IN 1..v_months LOOP
    v_start := v_cursor;
    v_end := (v_cursor + interval '1 month - 1 day')::date;

    SELECT EXISTS (
      SELECT 1
      FROM public.utility_bills ub
      WHERE ub.utility_account_id = v_account.id
        AND ub.period_start = v_start
        AND ub.period_end = v_end
        AND ub.status <> 'cancelled'
    ) INTO v_existed;

    v_bill := public.generate_flat_utility_bill(v_account.id, v_start, v_end, NULL);

    IF v_existed THEN
      v_reused := v_reused + 1;
    ELSE
      v_issued := v_issued + 1;
    END IF;

    v_periods := v_periods || jsonb_build_array(
      jsonb_build_object(
        'period_start', v_start,
        'period_end', v_end,
        'bill_id', v_bill.id,
        'amount', v_bill.total_amount,
        'balance', v_bill.balance,
        'new', NOT v_existed
      )
    );

    v_cursor := (v_cursor + interval '1 month')::date;
  END LOOP;

  RETURN jsonb_build_object(
    'utility_account_id', v_account.id,
    'monthly_fee', v_fee,
    'months', v_months,
    'issued', v_issued,
    'already_existed', v_reused,
    'periods', v_periods
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_flat_bills_months_ahead(uuid, integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_flat_bills_months_ahead(uuid, integer, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_flat_bills_months_ahead(uuid, integer, date) TO authenticated;

COMMENT ON FUNCTION public.issue_flat_bills_months_ahead(uuid, integer, date) IS
  'Issue 1-36 consecutive monthly flat bills for one account using saved monthly fee.';
