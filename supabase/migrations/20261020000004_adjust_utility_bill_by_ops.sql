-- Allow utility admin/staff to adjust bill amounts (including $0) or cancel a bill.
-- Used by the water invoice “Edit payment amounts” UI so changes persist system-wide.

CREATE OR REPLACE FUNCTION public.adjust_utility_bill_by_ops(
  p_utility_bill_id uuid,
  p_total_amount numeric DEFAULT NULL,
  p_cancel boolean DEFAULT false
)
RETURNS public.utility_bills
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.utility_bills%ROWTYPE;
  v_new_total numeric(12, 2);
  v_new_balance numeric(12, 2);
  v_new_status public.bill_status;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_bill
  FROM public.utility_bills
  WHERE id = p_utility_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility bill not found';
  END IF;

  IF NOT public.can_manage_utility_ops(v_bill.tenant_id) THEN
    RAISE EXCEPTION 'not authorized to adjust utility bills'
      USING ERRCODE = '42501';
  END IF;

  IF v_bill.status = 'cancelled' THEN
    RAISE EXCEPTION 'bill is already cancelled';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  IF COALESCE(p_cancel, false) THEN
    PERFORM public._insert_audit_log(
      v_bill.tenant_id,
      auth.uid(),
      'utility.bill_cancelled_by_ops',
      'utility_bill',
      v_bill.id,
      jsonb_build_object(
        'utility_account_id', v_bill.utility_account_id,
        'previous_total', v_bill.total_amount,
        'previous_balance', v_bill.balance
      )
    );

    UPDATE public.utility_bills
    SET
      status = 'cancelled'::public.bill_status,
      updated_at = now()
    WHERE id = v_bill.id
    RETURNING * INTO v_bill;

    RETURN v_bill;
  END IF;

  IF p_total_amount IS NULL THEN
    RAISE EXCEPTION 'provide p_total_amount or set p_cancel = true';
  END IF;

  v_new_total := round(p_total_amount::numeric, 2);
  IF v_new_total < 0 THEN
    RAISE EXCEPTION 'bill amount cannot be negative';
  END IF;

  IF v_new_total < v_bill.amount_paid THEN
    RAISE EXCEPTION 'new amount (%) cannot be less than already paid (%)',
      v_new_total, v_bill.amount_paid;
  END IF;

  v_new_balance := round(v_new_total - v_bill.amount_paid, 2);

  IF v_new_balance = 0 THEN
    v_new_status := 'paid'::public.bill_status;
  ELSIF v_bill.amount_paid > 0 THEN
    v_new_status := 'partial'::public.bill_status;
  ELSIF v_bill.due_date < CURRENT_DATE THEN
    v_new_status := 'overdue'::public.bill_status;
  ELSE
    v_new_status := 'issued'::public.bill_status;
  END IF;

  UPDATE public.utility_bills
  SET
    total_amount = v_new_total,
    -- Keep water flat bills consistent: unit line is unused; extra_charges carries the fee.
    extra_charges = v_new_total,
    balance = v_new_balance,
    status = v_new_status,
    updated_at = now()
  WHERE id = v_bill.id
  RETURNING * INTO v_bill;

  PERFORM public._insert_audit_log(
    v_bill.tenant_id,
    auth.uid(),
    'utility.bill_amount_adjusted_by_ops',
    'utility_bill',
    v_bill.id,
    jsonb_build_object(
      'utility_account_id', v_bill.utility_account_id,
      'total_amount', v_bill.total_amount,
      'balance', v_bill.balance,
      'status', v_bill.status
    )
  );

  RETURN v_bill;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_utility_bill_by_ops(uuid, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_utility_bill_by_ops(uuid, numeric, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_utility_bill_by_ops(uuid, numeric, boolean) TO authenticated;
