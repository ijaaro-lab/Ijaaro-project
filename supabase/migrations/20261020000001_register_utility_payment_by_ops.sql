-- Allow utility admin/staff to register a pending payment on behalf of a customer.
-- Approval remains admin-only via review_utility_payment. Never auto-approves.

CREATE OR REPLACE FUNCTION public.register_utility_payment_by_ops(
  p_utility_bill_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_reference text DEFAULT NULL,
  p_proof_path text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS public.utility_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.utility_bills%ROWTYPE;
  v_account public.utility_accounts%ROWTYPE;
  v_payment public.utility_payments%ROWTYPE;
  v_amount numeric(12, 2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_amount := round(p_amount::numeric, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'payment amount must be greater than zero';
  END IF;

  SELECT * INTO v_bill
  FROM public.utility_bills
  WHERE id = p_utility_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility bill not found';
  END IF;

  IF NOT public.can_manage_utility_ops(v_bill.tenant_id) THEN
    RAISE EXCEPTION 'not authorized to register utility payments'
      USING ERRCODE = '42501';
  END IF;

  IF v_bill.status IN ('cancelled', 'draft') THEN
    RAISE EXCEPTION 'cannot pay a cancelled or draft bill';
  END IF;

  IF v_amount > v_bill.balance THEN
    RAISE EXCEPTION 'payment amount exceeds outstanding balance';
  END IF;

  SELECT * INTO v_account
  FROM public.utility_accounts
  WHERE id = v_bill.utility_account_id
    AND tenant_id = v_bill.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility account not found';
  END IF;

  IF v_account.customer_id IS NULL THEN
    RAISE EXCEPTION 'account has no customer to attribute the payment to';
  END IF;

  -- One pending payment per bill+payer (matches existing unique index).
  IF EXISTS (
    SELECT 1
    FROM public.utility_payments up
    WHERE up.utility_bill_id = v_bill.id
      AND up.payer_id = v_account.customer_id
      AND up.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'a pending payment already exists for this bill';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  INSERT INTO public.utility_payments (
    tenant_id,
    utility_bill_id,
    utility_account_id,
    payer_id,
    amount,
    currency,
    method,
    reference,
    proof_path,
    status,
    submitted_at,
    reviewed_by,
    reviewed_at,
    rejection_reason,
    idempotency_key
  ) VALUES (
    v_bill.tenant_id,
    v_bill.id,
    v_bill.utility_account_id,
    v_account.customer_id,
    v_amount,
    'USD',
    p_method,
    NULLIF(trim(COALESCE(p_reference, '')), ''),
    NULLIF(trim(COALESCE(p_proof_path, '')), ''),
    'pending'::public.payment_status,
    now(),
    NULL,
    NULL,
    NULL,
    NULLIF(trim(COALESCE(p_idempotency_key, '')), '')
  )
  RETURNING * INTO v_payment;

  PERFORM public._insert_audit_log(
    v_payment.tenant_id,
    auth.uid(),
    'utility.payment_registered_by_ops',
    'utility_payment',
    v_payment.id,
    jsonb_build_object(
      'utility_bill_id', v_bill.id,
      'utility_account_id', v_account.id,
      'payer_id', v_account.customer_id,
      'amount', v_amount,
      'method', p_method,
      'registered_by', auth.uid(),
      'status', 'pending'
    )
  );

  RETURN v_payment;
END;
$$;

REVOKE ALL ON FUNCTION public.register_utility_payment_by_ops(
  uuid, numeric, public.payment_method, text, text, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.register_utility_payment_by_ops(
  uuid, numeric, public.payment_method, text, text, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.register_utility_payment_by_ops(
  uuid, numeric, public.payment_method, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.register_utility_payment_by_ops IS
  'Company admin/staff register a pending utility payment for a customer. Does not approve.';
