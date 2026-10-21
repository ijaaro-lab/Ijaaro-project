-- Issue (or reuse) this month's flat bill for every active water/electricity
-- account that has a monthly fee — so ops can charge all customers in one click
-- without re-entering amounts.

CREATE OR REPLACE FUNCTION public.issue_monthly_flat_bills_for_tenant(
  p_tenant_id uuid,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_start date;
  v_end date;
  v_bill public.utility_bills%ROWTYPE;
  v_issued int := 0;
  v_reused int := 0;
  v_skipped int := 0;
  v_fee numeric(12, 2);
  v_existed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_manage_utility_ops(p_tenant_id) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', CURRENT_DATE)::date);
  v_end := COALESCE(
    p_period_end,
    (date_trunc('month', v_start) + interval '1 month - 1 day')::date
  );

  IF v_end < v_start THEN
    RAISE EXCEPTION 'invalid billing period';
  END IF;

  FOR r IN
    SELECT ua.id
    FROM public.utility_accounts ua
    WHERE ua.tenant_id = p_tenant_id
      AND ua.status IN ('active', 'suspended')
      AND COALESCE((ua.extra_charges_config->>'fixed_amount')::numeric, 0) > 0
    ORDER BY ua.account_number
  LOOP
    v_fee := NULL;
    SELECT COALESCE((ua.extra_charges_config->>'fixed_amount')::numeric, 0)
    INTO v_fee
    FROM public.utility_accounts ua
    WHERE ua.id = r.id;

    IF COALESCE(v_fee, 0) <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.utility_bills ub
      WHERE ub.utility_account_id = r.id
        AND ub.period_start = v_start
        AND ub.period_end = v_end
        AND ub.status <> 'cancelled'
    ) INTO v_existed;

    BEGIN
      v_bill := public.generate_flat_utility_bill(r.id, v_start, v_end, NULL);
      IF v_existed THEN
        v_reused := v_reused + 1;
      ELSE
        v_issued := v_issued + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'period_start', v_start,
    'period_end', v_end,
    'issued', v_issued,
    'already_existed', v_reused,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.issue_monthly_flat_bills_for_tenant(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.issue_monthly_flat_bills_for_tenant(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.issue_monthly_flat_bills_for_tenant(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.issue_monthly_flat_bills_for_tenant(uuid, date, date) IS
  'Company ops: issue current (or given) month flat bills for all accounts with a monthly fee.';
