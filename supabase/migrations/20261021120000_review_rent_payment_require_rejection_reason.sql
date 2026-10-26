-- =============================================================================
-- RP-1.3 — review_rent_payment: require non-empty rejection reason on reject
-- =============================================================================
-- Preserves signature, return shape, approve path, auth, SECURITY DEFINER,
-- search_path, and grants. Does not add columns or table CHECK constraints.
-- Does not backfill historical rejected rows with null rejection_reason.
-- DO NOT auto-apply to Live; local apply is a separate approved step.
-- =============================================================================

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
  v_reason text;
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
    -- Strip all leading/trailing whitespace (spaces, tabs, newlines) — plain trim() is spaces-only.
    v_reason := NULLIF(
      regexp_replace(COALESCE(p_rejection_reason, ''), E'^\\s+|\\s+$', '', 'g'),
      ''
    );
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'rejection reason is required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.rent_payments
    SET
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      rejection_reason = v_reason,
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

  -- approve (unchanged)
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

COMMENT ON FUNCTION public.review_rent_payment(uuid, text, text) IS
  'Approve or reject a pending rent payment. Reject requires a non-empty trimmed rejection_reason. Approve path unchanged.';

REVOKE ALL ON FUNCTION public.review_rent_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_rent_payment(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_rent_payment(uuid, text, text) TO authenticated;
