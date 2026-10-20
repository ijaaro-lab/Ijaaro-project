-- Update / deactivate utility customer account + linked premises (ops).
-- Edit: utility_admin + utility_staff. Deactivate: utility_admin only.

CREATE OR REPLACE FUNCTION public.update_utility_customer_by_ops(
  p_utility_account_id uuid,
  p_name text DEFAULT NULL,
  p_address_line text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_account_number text DEFAULT NULL,
  p_monthly_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.utility_accounts%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_fee numeric(12, 2);
  v_cfg jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_account
  FROM public.utility_accounts
  WHERE id = p_utility_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility account not found';
  END IF;

  IF NOT public.can_manage_utility_ops(v_account.tenant_id) THEN
    RAISE EXCEPTION 'not authorized to update customers'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_property
  FROM public.properties
  WHERE id = v_account.property_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer / premises not found';
  END IF;

  IF p_address_line IS NOT NULL AND NULLIF(trim(p_address_line), '') IS NULL THEN
    RAISE EXCEPTION 'address_line cannot be empty';
  END IF;

  IF p_account_number IS NOT NULL AND NULLIF(trim(p_account_number), '') IS NULL THEN
    RAISE EXCEPTION 'account_number cannot be empty';
  END IF;

  IF p_monthly_amount IS NOT NULL AND p_monthly_amount < 0 THEN
    RAISE EXCEPTION 'monthly_amount must be >= 0';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  UPDATE public.properties
  SET
    name = CASE
      WHEN p_name IS NULL THEN name
      ELSE NULLIF(trim(p_name), '')
    END,
    address_line = CASE
      WHEN p_address_line IS NULL THEN address_line
      ELSE trim(p_address_line)
    END,
    district = CASE
      WHEN p_district IS NULL THEN district
      ELSE NULLIF(trim(p_district), '')
    END,
    city = CASE
      WHEN p_city IS NULL THEN city
      ELSE NULLIF(trim(p_city), '')
    END,
    contact_phone = CASE
      WHEN p_contact_phone IS NULL THEN contact_phone
      ELSE NULLIF(trim(p_contact_phone), '')
    END,
    contact_email = CASE
      WHEN p_contact_email IS NULL THEN contact_email
      ELSE NULLIF(trim(lower(p_contact_email)), '')
    END,
    updated_at = now()
  WHERE id = v_property.id
  RETURNING * INTO v_property;

  v_cfg := COALESCE(v_account.extra_charges_config, '{}'::jsonb);
  IF p_monthly_amount IS NOT NULL THEN
    v_fee := round(p_monthly_amount::numeric, 2);
    v_cfg := jsonb_set(v_cfg, '{fixed_amount}', to_jsonb(v_fee), true);
  END IF;

  UPDATE public.utility_accounts
  SET
    account_number = CASE
      WHEN p_account_number IS NULL THEN account_number
      ELSE trim(p_account_number)
    END,
    extra_charges_config = v_cfg,
    updated_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  -- Keep display name on the customer profile when we have one.
  IF v_account.customer_id IS NOT NULL AND p_name IS NOT NULL AND NULLIF(trim(p_name), '') IS NOT NULL THEN
    UPDATE public.profiles
    SET
      full_name = trim(p_name),
      updated_at = now()
    WHERE id = v_account.customer_id;
  END IF;

  PERFORM public._insert_audit_log(
    v_account.tenant_id,
    auth.uid(),
    'utility.customer_updated_by_ops',
    'utility_account',
    v_account.id,
    jsonb_build_object(
      'property_id', v_property.id,
      'account_number', v_account.account_number,
      'monthly_amount', v_cfg -> 'fixed_amount'
    )
  );

  RETURN jsonb_build_object('account', to_jsonb(v_account), 'property', to_jsonb(v_property));
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_utility_account_by_admin(
  p_utility_account_id uuid
)
RETURNS public.utility_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.utility_accounts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_account
  FROM public.utility_accounts
  WHERE id = p_utility_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'utility account not found';
  END IF;

  -- Admin only (staff may view/edit, not delete/deactivate).
  IF NOT public.has_role(v_account.tenant_id, ARRAY['utility_admin'::public.app_role]) THEN
    RAISE EXCEPTION 'only company admin can deactivate customers'
      USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('ijaaro.internal', '1', true);

  UPDATE public.utility_accounts
  SET
    status = 'inactive',
    updated_at = now()
  WHERE id = v_account.id
  RETURNING * INTO v_account;

  PERFORM public._insert_audit_log(
    v_account.tenant_id,
    auth.uid(),
    'utility.account_deactivated_by_admin',
    'utility_account',
    v_account.id,
    jsonb_build_object('account_number', v_account.account_number)
  );

  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION public.update_utility_customer_by_ops(
  uuid, text, text, text, text, text, text, text, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_utility_customer_by_ops(
  uuid, text, text, text, text, text, text, text, numeric
) TO authenticated;

REVOKE ALL ON FUNCTION public.deactivate_utility_account_by_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_utility_account_by_admin(uuid) TO authenticated;
